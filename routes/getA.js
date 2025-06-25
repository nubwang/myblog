var express = require('express');
var router = express.Router();
const querySql = require('../db/index');
var OpenAI  = require('openai');
// const dotenv = require('dotenv');
const path = require('path');
// dotenv.config();

const openai = new OpenAI({
  baseURL: process.env.baseURL,
  apiKey: process.env.apiKey
});
router.post("/content",async(req,res,next)=>{
  let data = req.body;
  console.log(data);
  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'system', content: data.content }],
      model: "deepseek-chat",
    });
    console.log(completion.choices[0].message.content);
    res.send({code:200,msg:'',data:{content: completion.choices[0].message.content}})
  }catch(e){
    res.send({code:e.errno,msg: e.sqlMessage})
  } 
})
module.exports = router;
