var express = require('express');
var router = express.Router();
const pool = require('../db/index')
router.post('/add',async(req,res,next) => {
  const { userId, friendId } = req.body;
  try {
    const [result] = await pool.query( 'INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)', [userId, friendId] );
    res.status(200).json({ message: 'Friend request sent successfully', id: result.insertId });
  }catch(e){
    console.error('Error sending friend request:', e);
    res.status(500).json({ message: 'Failed to send friend request' });
    next(e)
  } 
})
// 添加好友请求
// router.post('/add', async (req, res, next) => {
//   const { userId, friendId } = req.body;
//   try {
//     const [result] = await pool.query(
//       'INSERT INTO friendships (user_id, friend_id) VALUES (?, ?)',
//       [userId, friendId]
//     );
//     res.status(200).json({ message: 'Friend request sent successfully', id: result.insertId });
//   } catch (error) {
//     console.error('Error sending friend request:', error);
//     res.status(500).json({ message: 'Failed to send friend request' });
//     next(error)
//   }
// });

// 接受好友请求
// router.put('/:id/accept', async (req, res,next) => {
//   const { id } = req.params;

//   try {
//     const [result] = await pool.query(
//       'UPDATE friendships SET status = "accepted" WHERE id = ?',
//       [id]
//     );

//     if (result.affectedRows === 0) {
//       return res.status(404).json({ message: 'Friend request not found' });
//     }

//     res.json({ message: 'Friend request accepted successfully' });
//   } catch (error) {
//     console.error('Error accepting friend request:', error);
//     res.status(500).json({ message: 'Failed to accept friend request' });
//     next(error)
//   }
// });

// // 拒绝好友请求
// router.put('/:id/reject', async (req, res,next) => {
//   const { id } = req.params;

//   try {
//     const [result] = await pool.query(
//       'UPDATE friendships SET status = "rejected" WHERE id = ?',
//       [id]
//     );

//     if (result.affectedRows === 0) {
//       return res.status(404).json({ message: 'Friend request not found' });
//     }

//     res.json({ message: 'Friend request rejected successfully' });
//   } catch (error) {
//     console.error('Error rejecting friend request:', error);
//     res.status(500).json({ message: 'Failed to reject friend request' });
//     next(error)
//   }
// });

// // 获取好友列表
// router.get('/:userId/friends', async (req, res,next) => {
//   const { userId } = req.params;

//   try {
//     const [rows] = await pool.query( `SELECT u.id, u.username FROM users u JOIN friendships f ON (u.id = f.friend_id AND f.user_id = ? AND f.status = 'accepted') UNION SELECT u.id, u.username FROM users u JOIN friendships f ON (u.id = f.user_id AND f.friend_id = ? AND f.status = 'accepted')`, [userId, userId] );

//     res.json(rows);
//   } catch (error) {
//     console.error('Error fetching friends:', error);
//     res.status(500).json({ message: 'Failed to fetch friends' });
//     next(error)
//   }
// });

module.exports = router;