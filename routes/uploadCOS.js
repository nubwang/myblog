var express = require('express');
var router = express.Router();
const fs = require('fs');
const path = require('path');
const COS = require('cos-nodejs-sdk-v5');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
router.post("/upload", upload.single('file'),async(req,res,next)=>{
    // SECRETID 和 SECRETKEY 请登录 https://console.cloud.tencent.com/cam/capi 进行查看和管理
    const file = req.file;
    console.log(file,'filefilefilefilefile')
    if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    try {
        const config = {
            SecretId: process.env.SecretId,     // 替换为你的SecretId
            SecretKey: process.env.SecretKey,   // 替换为你的SecretKey
            Region: 'ap-beijing',          // 替换为你的Region，例如ap-guangzhou
        };
        const cos = await new COS(config);
        cos.getService(function (err, data) {
            console.log(data && data.Buckets,'Buckets');
        });
        let params = {
            Bucket: 'herbs-1302047761', /* 必须 */
            Region: 'ap-beijing',    /* 必须 */
            Key: `${Date.now()}_${file.originalname}`,              /* 必须 */
            Body: file.buffer, // 上传文件对象
            ContentType: 'image/png',
            ContentDisposition:'inline'
        }
        cos.putObject(params, function(err, data) {
            if (err) {
                console.error('Upload to COS failed:', err);
                return res.status(500).json({ error: 'Upload failed' });
            }
            console.log(err || data);
            res.send({code:200,msg:'图片上传成功！',data:{imageUrl: `https://wangzhenjie.cn/${params.Key}`,data:data}})
        });
      }catch(e){
        console.log(e)
        next(e)
      } 
})


module.exports = router;