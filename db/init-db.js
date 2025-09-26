// const querySql = require('./index');
const { pool,querySql } = require('./index'); // 导入连接池

async function initializeDatabase() {
  try {
    await querySql(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        nickname VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        avatar VARCHAR(255),
        head_img VARCHAR(255),
        status ENUM('online', 'offline') DEFAULT 'offline',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await querySql(`
      CREATE TABLE IF NOT EXISTS conversations (
          conversation_id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '会话ID',
          user_id BIGINT NOT NULL COMMENT '用户ID',
          peer_type ENUM('user', 'group') NOT NULL COMMENT '对方类型(用户/群组)',
          peer_id BIGINT NOT NULL COMMENT '对方ID(用户ID或群组ID)',
          last_msg_content VARCHAR(255) COMMENT '最后一条消息摘要',
          last_msg_time DATETIME COMMENT '最后一条消息时间',
          is_top TINYINT(1) DEFAULT 0 COMMENT '是否置顶',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY uk_user_peer (user_id, peer_type, peer_id),
          INDEX idx_private_conv (peer_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会话表';

    `);

    await querySql(`
      CREATE TABLE IF NOT EXISTS conversation_users (
        id BIGINT PRIMARY KEY AUTO_INCREMENT,
        conversation_id BIGINT NOT NULL,
        user_id BIGINT NOT NULL,
        unread_count INT DEFAULT 0 COMMENT '未读消息数',
        last_read_msg_id BIGINT COMMENT '最后已读消息ID',
        is_muted BOOLEAN DEFAULT FALSE COMMENT '是否免打扰',
        UNIQUE KEY uk_conv_user (conversation_id, user_id),
        FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await querySql(`
      CREATE TABLE IF NOT EXISTS pc_groups (
          group_id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '群组ID',
          group_name VARCHAR(100) NOT NULL COMMENT '群名称',
          creator_id BIGINT NOT NULL COMMENT '创建者ID',
          avatar_url VARCHAR(255) COMMENT '群头像URL',
          announcement VARCHAR(500) COMMENT '群公告',
          max_members INT DEFAULT 500 COMMENT '最大成员数',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='群组表';
    `);

    await querySql(`
      CREATE TABLE IF NOT EXISTS group_members (
          id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
          group_id BIGINT NOT NULL COMMENT '群组ID',
          user_id BIGINT NOT NULL COMMENT '用户ID',
          role ENUM('owner', 'admin', 'member') DEFAULT 'member' COMMENT '群角色',
          join_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
          nick_in_group VARCHAR(50) COMMENT '群昵称',
          last_read_msg_id BIGINT COMMENT '最后阅读消息ID',
          FOREIGN KEY (group_id) REFERENCES pc_groups(group_id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY uk_group_user (group_id, user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='群组成员表';
    `);

    await querySql(`
      CREATE TABLE IF NOT EXISTS messages (
          msg_id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '消息ID',
          conversation_id BIGINT NOT NULL COMMENT '会话ID',
          sender_id BIGINT NOT NULL COMMENT '发送者ID',
          receiver_type ENUM('user', 'group') NOT NULL COMMENT '接收类型(用户/群组)',
          receiver_id BIGINT NOT NULL COMMENT '接收者ID(用户ID或群组ID)',
          content_type ENUM('text', 'image', 'video', 'voice', 'file', 'location', 'emoji', 'system') NOT NULL COMMENT '消息类型',
          content TEXT COMMENT '消息内容(文本)或URL(媒体)',
          duration INT COMMENT '语音/视频时长(秒)',
          file_size BIGINT COMMENT '文件大小(字节)',
          status ENUM('sending', 'sent', 'received', 'read', 'failed', 'recalled') DEFAULT 'sending' COMMENT '消息状态',
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发送时间',
          read_time DATETIME COMMENT '阅读时间',
          -- 外键约束
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
          -- 索引
          INDEX idx_receiver (receiver_type, receiver_id),
          INDEX idx_sender_time (sender_id, timestamp),
          INDEX idx_conversation_time (conversation_id, timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息表';
    `);

    await querySql(`
      CREATE TABLE IF NOT EXISTS message_recalls (
          id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
          msg_id BIGINT NOT NULL COMMENT '消息ID',
          recaller_id BIGINT NOT NULL COMMENT '撤回者ID',
          recall_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '撤回时间',
          FOREIGN KEY (msg_id) REFERENCES messages(msg_id) ON DELETE CASCADE,
          FOREIGN KEY (recaller_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='消息撤回记录表';
    `);

    console.log('Database tables created/verified successfully!');
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    pool.end(); // 正确关闭连接池
  }
}

initializeDatabase();