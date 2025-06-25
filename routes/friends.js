var express = require('express');
var router = express.Router();
const querySql = require('../db/index')
router.get('/test', (req, res) => {
  res.send('Friends route is working');
});
router.post('/add',async(req,res,next) => {
  const { userId, friendId } = req.body;
  console.log(userId, friendId,'userId, friendId')
  try {
    const [result] = await querySql( 'INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)', [userId, friendId] );
    // res.send({code:200,msg:'发送成功',data: {id: result.insertId}})
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
router.post('/:id/accept', async (req, res,next) => {
  const { id } = req.params;

  try {
    const result = await querySql( 'UPDATE friendships SET status = "accepted" WHERE id = ?', [id] );
    console.log(result,'resultresultresultresult')
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    res.json({ message: 'Friend request accepted successfully' });
  } catch (error) {
    console.error('Error accepting friend request:', error);
    res.status(500).json({ message: error.sqlMessage });
    // next(error)
  }
});

// // 拒绝好友请求
router.post('/:id/reject', async (req, res,next) => {
  const { id } = req.params;

  try {
    const [result] = await querySql(
      'UPDATE friendships SET status = "rejected" WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Friend request not found' });
    }

    res.json({ message: 'Friend request rejected successfully' });
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

    res.json(rows);
  } catch (error) {
    console.error('Error fetching friends:', error);
    res.status(500).json({ message: 'Failed to fetch friends' });
    // next(error)
  }
});

router.get('/:userId/pending', async (req, res,next) => {
  const { userId } = req.params;
  console.log(userId,'userId')

  try {
    const [rows] = await querySql( `SELECT u.id, u.username, u.head_img FROM users u JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'pending')`, [userId] );
    console.log(rows,'rows')
    res.json(rows);
  } catch (error) {
    console.error('Error fetching friends pending:', error);
    res.status(500).json({ message: 'Failed to fetch friends pending' });
    // next(error)
  }
});

module.exports = router;