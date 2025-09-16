var express = require('express');
var router = express.Router();
const { querySql, transaction, pool  } = require('../db/index')
router.get('/test', (req, res) => {
  res.send({code:401,msg:'测试token过期接口'})
});
//发送好友
router.post('/add',async(req,res,next) => {
  const { userId, friendId, notes } = req.body;
  console.log(userId, friendId,notes,'userId, friendId')
  try {
    const result = await querySql( 'INSERT INTO friendships (user_id, friend_id, notes) VALUES (?, ?, ?)', [userId, friendId, notes?notes:"[]"] );
    // res.send({code:200,msg:'发送成功',data: {id: result.insertId}})
    console.log(result,'resultresultresult')
    res.status(200).json({ message: 'Friend request sent successfully', data:{id: result.insertId} });
  }catch(e){
    // console.error('Error sending friend request:', e);
    console.log(e,'11111')
    if(e.code === "ER_DUP_ENTRY"){
      res.status(200).json({ message: '已经发送成功了,不要重复发送!' });
    }else{
      res.status(500).json({ message: e.sqlMessage });
    }
    // next(e)
  } 
})
// 接受好友请求
router.post('/accept', async (req, res,next) => {
  const { friendId, userId } = req.body;
  console.log(friendId,'userId');
  try {
    const result = await querySql( 'UPDATE friendships SET status = "accepted" WHERE user_id = ? AND friend_id = ?', [userId,friendId] );
    console.log(result,'resultresultresultresult')
    if (result.affectedRows === 0) {
      return res.status(200).json({ message: 'Friend request not found' });
    }
    res.json({ message: 'Friend request accepted successfully',code:200 });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ message: error.sqlMessage });
    // next(error)
  }
});

// // 拒绝好友请求
router.post('/reject', async (req, res,next) => {
  const { friendId,userId } = req.body;

  try {
    const [result] = await querySql(
      'UPDATE friendships SET status = "rejected" WHERE user_id = ? AND friend_id = ?',
      [userId,friendId]
    );

    if (result.affectedRows === 0) {
      return res.status(200).json({ message: 'Friend request not found' });
    }

    res.json({ message: 'Friend request rejected successfully',code:200 });
  } catch (error) {
    console.error('Error rejecting friend request:', error);
    res.status(500).json({ message: 'Failed to reject friend request' });
    next(error)
  }
});

// // 获取好友列表
router.get('/:userId', async (req, res,next) => {
  const { userId } = req.params;

  try {
    const [rows] = await querySql( `SELECT u.id, u.username, u.head_img FROM users u JOIN friendships f ON (u.id = f.friend_id AND f.user_id = ? AND f.status = 'accepted') UNION SELECT u.id, u.username, u.head_img FROM users u JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'accepted')`, [userId, userId] );
    console.log(rows,'rows')
    res.json(rows);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ message: 'Failed to fetch friends' });
    // next(error)
  }
});
//获取好友请求列表
router.get('/:userId/pending', async (req, res,next) => {
  const { userId } = req.params;
  console.log(userId,'userId')

  try {
    const rows = await querySql( `SELECT u.id, u.username, u.head_img FROM users u JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'pending')`, [userId] );
    console.log(rows,'rows')
    res.json({message: rows});
  } catch (error) {
    console.error('Error fetching friends pending:', error);
    res.status(500).json({ message: 'Failed to fetch friends pending' });
    // next(error)
  }
});

module.exports = router;