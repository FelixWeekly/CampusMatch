const express = require('express');
const cors = require('cors');
// 【魔法在这里】直接引入 Node.js 原生自带的 SQLite，无需任何 npm 安装！
const { DatabaseSync } = require('node:sqlite');

const app = express();
app.use(cors());
app.use(express.json());

// 1. 连接数据库 (如果文件不存在会自动创建)
const db = new DatabaseSync('./database.sqlite');

// 2. 初始化三张表：用户表(users) + 帖子表(posts)/发布者 + 🌟 新增：申请表(applications)/接收者
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT
    );
    
    CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT,
        title TEXT,
        content TEXT,
        type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 🌟 这是一张“关系表”，用来记录谁接了哪个单子
    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,           -- 关联的帖子 ID
        applicant_name TEXT,       -- 申请人的名字
        message TEXT,              -- 申请留言（比如：我会弹吉他）
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// 3. 编写【注册接口】
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    
    try {
        // 准备 SQL 语句
        const stmt = db.prepare("INSERT INTO users (name, email, password) VALUES (?, ?, ?)");
        // 执行插入
        stmt.run(name, email, password);
        res.json({ success: true, message: '注册成功！' });
    } catch (err) {
        // 如果邮箱重复，SQLite 会抛出异常被这里捕获
        res.status(400).json({ success: false, message: '该邮箱已被注册或数据错误！' });
    }
});

// 4. 编写【登录接口】
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    
    try {
        const stmt = db.prepare("SELECT * FROM users WHERE email = ? AND password = ?");
        // get 方法会返回匹配的第一行数据
        const row = stmt.get(email, password);
        
        if (row) {
            // 🌟 注意这里：我把 row.name 也放进去了，方便前端保存
            res.json({ success: true, message: '登录成功', userName: row.name });
        } else {
            res.status(401).json({ success: false, message: '邮箱或密码错误！' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: '服务器内部错误' });
    }
});

// 🌟 【新增：发布帖子接口】
app.post('/api/posts', (req, res) => {
    const { author, title, content, type } = req.body;
    try {
        const stmt = db.prepare("INSERT INTO posts (author, title, content, type) VALUES (?, ?, ?, ?)");
        stmt.run(author, title, content, type);
        res.json({ success: true, message: '发布成功！' });
    } catch (err) {
        res.status(500).json({ success: false, message: '发布失败' });
    }
});

// 🌟 【新增：获取所有帖子接口】(按时间倒序排列，最新的在最上面)
app.get('/api/posts', (req, res) => {
    try {
        const stmt = db.prepare("SELECT * FROM posts ORDER BY created_at DESC");
        const posts = stmt.all(); // all() 会获取所有匹配的行，返回一个数组
        res.json({ success: true, data: posts });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取帖子失败' });
    }
});

// 🌟 【新增：提交报名/申请接口】
app.post('/api/apply', (req, res) => {
    const { post_id, applicant_name, message } = req.body;
    try {
        const stmt = db.prepare("INSERT INTO applications (post_id, applicant_name, message) VALUES (?, ?, ?)");
        stmt.run(post_id, applicant_name, message);
        res.json({ success: true, message: '报名成功！对方会收到你的留言。' });
    } catch (err) {
        res.status(500).json({ success: false, message: '报名失败' });
    }
});

// 🌟 【新增：获取“我的收件箱”接口】(查看谁申请了我的帖子)
app.get('/api/my-messages', (req, res) => {
    // 从请求的 URL 里获取当前登录的用户名 (?user=xxx)
    const currentUser = req.query.user; 
    
    try {
        // 🔮 魔法 SQL：联合查询 (JOIN)
        // 逻辑：从 applications 表中找出所有申请，前提是这些申请对应的 posts 表里的 author 是当前用户。
        const stmt = db.prepare(`
            SELECT 
                applications.applicant_name, 
                applications.message, 
                applications.created_at, 
                posts.title 
            FROM applications 
            JOIN posts ON applications.post_id = posts.id 
            WHERE posts.author = ?
            ORDER BY applications.created_at DESC
        `);
        
        // 执行查询
        const messages = stmt.all(currentUser);
        res.json({ success: true, data: messages });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '获取消息失败' });
    }
});

// 🌟 【新增：删除帖子接口 (带安全校验)】
app.delete('/api/posts/:id', (req, res) => {
    const postId = req.params.id; // 从网址里提取帖子 ID
    const author = req.body.author; // 提取请求体里的作者名字

    try {
        // 1. 安全第一：先去数据库里查一下，这个帖子到底是不是他发的？
        const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
        
        if (!post) {
            return res.status(404).json({ success: false, message: '帖子不存在' });
        }
        if (post.author !== author) {
            return res.status(403).json({ success: false, message: '警告：你没有权限删除别人的帖子！' });
        }

        // 2. 权限校验通过，执行删除操作
        db.prepare("DELETE FROM posts WHERE id = ?").run(postId);
        
        // 3. 极其专业的做法：级联删除。把别人对这个帖子的所有报名留言也一并清空！
        db.prepare("DELETE FROM applications WHERE post_id = ?").run(postId);

        res.json({ success: true, message: '删除成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '服务器错误' });
    }
});

// 启动服务器
const port = 3000;
app.listen(port, () => {
    console.log(`🚀 后端服务器已启动！运行在 http://localhost:${port}`);
    console.log(`📦 已成功使用 Node.js 原生 SQLite 数据库！`);
});