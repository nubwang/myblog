const express = require('express');
const router = express.Router();
const { querySql, transaction, pool  } = require('../db/index');
const { PWD_SALT, PRIVATE_KEY, EXPIRESD } = require('../utils/constant');
const { md5, upload } = require('../utils/index');
const jwt = require('jsonwebtoken');
const { getRedisClient } = require('../db/redis');
const redis = getRedisClient();
const crypto = require('crypto');

// 刷新token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.cookies;
  const { username } = req.body;
  if (!refreshToken) return res.status(401).send('Unauthorized');

  // 验证 Refresh Token 哈希值
  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const isValid = await redis.exists(tokenHash);
  if (!isValid) return res.status(401).send('Invalid Refresh Token');

  // 签发新 Token（同时使旧 Refresh Token 失效）
  const newAccessToken = jwt.sign({ username }, PRIVATE_KEY, { expiresIn: '15m' });
  const newRefreshToken = jwt.sign({}, PRIVATE_KEY, { expiresIn: '7d' });

  // 更新 Redis 中的哈希值
  const newTokenHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
  await redis.del(tokenHash); // 删除旧哈希
  await redis.setEx(newTokenHash, 7 * 24 * 60 * 60, 'valid'); // 存储新哈希

  // 返回新 Token
  res.cookie('refreshToken', newRefreshToken, { httpOnly: true, secure: true });
  res.json({ accessToken: newAccessToken });
});

// 注册接口
router.post('/register', async (req, res, next) => {
  let { username, password, head_img, nickname } = req.body;
  try {
    let user = await querySql('select * from users where username = ?', [username]);
    if (!user || user.length === 0) {
      password = md5(`${password}${PWD_SALT}`);
      await querySql('insert into users(username,password,head_img,nickname) values(?,?,?,?)', [username, password, head_img, nickname]);
      res.send({ code: 200, msg: '注册成功' });
    } else {
      res.send({ code: -1, msg: '该账号已注册' });
    }
  } catch (e) {
    next(e);
  }
});

// 登录接口
router.post('/login', async (req, res, next) => {
  let { username, password } = req.body;
  try {
    let user = await querySql('select * from users where username = ?', [username]);
    if (!user || user.length === 0) {
      res.send({ code: -1, msg: '该账号不存在' });
    } else {
      password = md5(`${password}${PWD_SALT}`);
      let result = await querySql('select id, username, nickname, email, avatar, head_img, status from users where username = ? and password = ?', [username, password]);
      if (!result || result.length === 0) {
        res.send({ code: -1, msg: '账号或者密码不正确' });
      } else {
        let token = jwt.sign({ username, id: result[0].id }, PRIVATE_KEY, { expiresIn: EXPIRESD });
        res.send({ code: 200, msg: '登录成功', data: { token: token, data: result } });
      }
    }
  } catch (e) {
    next(e);
  }
});

// 获取本人用户信息接口
router.get('/info_self', async (req, res, next) => {
  // 建议用 req.user.id，如果用了 JWT 中间件
  let id = req.user && req.user.id ? req.user.id : req.body.id;
  try {
    let userinfo = await querySql('select avatar, nickname, email from users where id = ?', [id]);
    res.send({ code: 200, msg: '成功', data: userinfo[0] });
  } catch (e) {
    next(e);
  }
});

// 获取他人用户信息接口
router.get('/info_other', async (req, res, next) => {
  let { id } = req.query;
  try {
    let userinfo = await querySql('select id,username,nickname,head_img from users where id = ?', [id]);
    res.send({ code: 200, msg: '成功', data: userinfo.length ? userinfo[0] : null });
  } catch (e) {
    next(e);
  }
});

// 头像上传接口
router.post('/upload', upload.single('head_img'), async (req, res, next) => {
  const imgUrl = req.body;
  let { id } = req.user;
  try {
    let result = await querySql('update users set avatar = ?, head_img = ? where id = ?', [imgUrl, imgUrl, id]);
    res.send({ code: 200, msg: '上传成功', data: imgUrl });
  } catch (e) {
    next(e);
  }
});

// 用户信息更新接口
router.post('/updateUser', async (req, res, next) => {
  const { id } = req.user;
  const { nickname, email, password } = req.body;
  let updateFields = [];
  let values = [];

  try {
    // 动态构建更新字段和参数
    if (nickname !== undefined) {
      updateFields.push('nickname = ?');
      values.push(nickname);
    }

    if (email !== undefined) {
      updateFields.push('email = ?');
      values.push(email);
    }

    if (password !== undefined) {
      // 密码加密处理
      const hashedPassword = md5(`${password}${PWD_SALT}`);
      updateFields.push('password = ?');
      values.push(hashedPassword);
    }

    // 验证至少有一个有效更新字段
    if (updateFields.length === 0) {
      return res.status(400).json({
        code: 400,
        msg: '没有提供有效的更新数据',
        data: null
      });
    }
    console.log(updateFields, values);
    // 构建完整SQL
    const sql = `UPDATE users SET ${updateFields.join(', ')} 
                 WHERE id = ?`;
    values.push(id); // 添加用户ID到参数末尾

    // 执行更新
    const result = await querySql(sql, values);

    // 验证更新结果
    if (result.affectedRows === 0) {
      return res.status(404).json({
        code: 404,
        msg: '用户不存在或更新失败',
        data: null
      });
    }

    res.json({
      code: 200,
      msg: '更新成功',
      data: null
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
