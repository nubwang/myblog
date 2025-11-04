var express = require('express');
var router = express.Router();
const fs = require('fs');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');
const multer = require('multer');
const { querySql } = require('../db/index');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
require('dotenv').config();

// 创建COS客户端
const cos = new COS({
    SecretId: process.env.SecretId,
    SecretKey: process.env.SecretKey,
    Region: 'ap-beijing',
});

router.post("/upload", upload.single('file'), async (req, res, next) => {
    const file = req.file;
    const { id, url } = req.body;

    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    // 1. 先上传新文件
    const params = {
        Bucket: 'chat-1302047761',
        Region: 'ap-beijing',
        Key: `${Date.now()}_${file.originalname}`,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
    };

    try {
        // 上传新文件
        const cosResult = await new Promise((resolve, reject) => {
            cos.putObject(params, (err, data) => {
                if (err) reject(err);
                else resolve(data);
            });
        });

        const imgUrl = `https://${params.Bucket}.cos.${params.Region}.myqcloud.com/${params.Key}`;

        // 2. 数据库事务处理（确保原子性）
        await querySql('START TRANSACTION');
        
        try {
            // 更新数据库
            await querySql('UPDATE users SET avatar = ?, head_img = ? WHERE id = ?', [imgUrl, imgUrl, id]);

            // 3. 删除旧文件（如果有）
            if (url) {
                try {
                    // 正确提取Key的方式
                    const oldKey = url.replace(`https://${params.Bucket}.cos.${params.Region}.myqcloud.com/`, '');
                    
                    await new Promise((resolve, reject) => {
                        cos.deleteObject({
                            Bucket: params.Bucket,
                            Region: params.Region,
                            Key: oldKey
                        }, (err, data) => {
                            if (err) {
                                console.error('删除旧文件失败:', err);
                                // 不中断流程，仅记录日志
                            }
                            resolve(data);
                        });
                    });
                } catch (deleteError) {
                    console.error('删除过程中出错:', deleteError);
                }
            }

            // 提交事务
            await querySql('COMMIT');
            
            res.send({
                code: 200,
                msg: '图片上传成功！',
                data: { imageUrl: imgUrl }
            });

        } catch (dbError) {
            // 回滚事务
            await querySql('ROLLBACK');
            throw dbError;
        }

    } catch (e) {
        console.error('上传失败:', e);
        next(e);
    }
});

module.exports = router;