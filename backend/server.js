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
// 🌟 数据库全面升级：增加了详细资料字段，新增了 reviews (评价) 表
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        email TEXT UNIQUE,
        password TEXT,
        department TEXT DEFAULT '未设置院系',
        grade TEXT DEFAULT '未设置年级',
        skills TEXT DEFAULT '暂无技能标签',
        bio TEXT DEFAULT '这个人很懒，还没写自我介绍~',
        portfolio TEXT DEFAULT ''
    );
    
    CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT,
        title TEXT,
        content TEXT,
        type TEXT,
        location TEXT DEFAULT '',
        compensation TEXT DEFAULT '',
        popularity INTEGER DEFAULT 0,
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

    -- 🌟 新增：用户评价表
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reviewer TEXT,     -- 评价人
        reviewee TEXT,     -- 被评价人
        rating INTEGER,    -- 星级 (1-5)
        comment TEXT,      -- 评语
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    -- 🌟 新增：私信表
    CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT,       -- 发送者
        recipient TEXT,    -- 接收者
        message TEXT,      -- 消息内容
        read INTEGER DEFAULT 0, -- 0 未读, 1 已读
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
    const { author, title, content, type, location, compensation, pay } = req.body;
    console.log('📝 收到发布请求:', { author, title, content, type, location, compensation });
    try {
        const stmt = db.prepare("INSERT INTO posts (author, title, content, type, location, compensation) VALUES (?, ?, ?, ?, ?, ?)");
        stmt.run(author, title, content, type, location || '', compensation || '');
        console.log('✅ 帖子发布成功！');
        res.json({ success: true, message: '发布成功！' });
    } catch (err) {
        console.error('❌ 发布帖子错误:', err.message);
        console.error('❌ 错误详情:', err);
        res.status(500).json({ success: false, message: '发布失败：' + err.message });
    }
});

// 🌟 【新增：获取所有帖子接口】(按时间倒序排列，最新的在最上面)
// 🌟 【升级：获取所有帖子接口 (带上已报名状态和报名人数)】
app.get('/api/posts', (req, res) => {
    const currentUser = req.query.user; // 获取当前是谁在看大厅
    try {
        const posts = db.prepare("SELECT * FROM posts ORDER BY created_at DESC").all();
        
        // 🔮 如果传了当前用户名，去查一下他都报了哪些名
        if (currentUser) {
            const myApps = db.prepare("SELECT post_id FROM applications WHERE applicant_name = ?").all(currentUser);
            const myAppSet = new Set(myApps.map(a => a.post_id)); // 用 Set 加速查找
            
            // 给每条帖子打上标记：有没有在我的报名集合里？
            posts.forEach(post => {
                post.has_applied = myAppSet.has(post.id);
            });
        }
        
        // 🌟 为每个帖子计算已报名人数
        posts.forEach(post => {
            const appCount = db.prepare("SELECT COUNT(*) as count FROM applications WHERE post_id = ?").get(post.id);
            post.applicant_count = appCount ? appCount.count : 0;
        });
        
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

// ================== 🌟 V2.0 新增接口 ==================

// 1. 获取用户主页资料与评价
app.get('/api/profile/:username', (req, res) => {
    const username = req.params.username;
    try {
        const user = db.prepare("SELECT name, email, department, grade, skills, bio, portfolio FROM users WHERE name = ?").get(username);
        if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

        const reviews = db.prepare("SELECT * FROM reviews WHERE reviewee = ? ORDER BY created_at DESC").all(username);
        
        // 计算平均星级
        let avgRating = 0;
        if (reviews.length > 0) {
            const sum = reviews.reduce((acc, curr) => acc + curr.rating, 0);
            avgRating = (sum / reviews.length).toFixed(1); // 保留一位小数
        }

        res.json({ success: true, data: user, reviews: reviews, avgRating: avgRating });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 2. 更新个人资料
app.put('/api/profile', (req, res) => {
    const { name, department, grade, skills, bio, portfolio } = req.body;
    try {
        db.prepare("UPDATE users SET department=?, grade=?, skills=?, bio=?, portfolio=? WHERE name=?").run(department, grade, skills, bio, portfolio, name);
        res.json({ success: true, message: '资料保存成功！' });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 3. 提交评价
app.post('/api/reviews', (req, res) => {
    const { reviewer, reviewee, rating, comment } = req.body;
    try {
        db.prepare("INSERT INTO reviews (reviewer, reviewee, rating, comment) VALUES (?, ?, ?, ?)").run(reviewer, reviewee, rating, comment);
        res.json({ success: true, message: '评价提交成功！' });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 🌟 【新增：删除评价接口 (带权限校验)】
app.delete('/api/reviews/:id', (req, res) => {
    const reviewId = req.params.id;
    const reviewer = req.body.reviewer; // 谁发起的删除请求？
    
    try {
        const review = db.prepare("SELECT * FROM reviews WHERE id = ?").get(reviewId);
        
        if (!review) return res.status(404).json({ success: false, message: '评价不存在' });
        if (review.reviewer !== reviewer) return res.status(403).json({ success: false, message: '无权删除别人的评价！' });
        
        db.prepare("DELETE FROM reviews WHERE id = ?").run(reviewId);
        res.json({ success: true, message: '删除成功' });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 🌟 【新增：获取私聊对话历史】
app.get('/api/conversation', (req, res) => {
    const { user, with: withUser } = req.query;
    
    if (!user || !withUser) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    try {
        // 获取两人之间的所有对话（双向）
        const stmt = db.prepare(`
            SELECT * FROM messages 
            WHERE (sender = ? AND recipient = ?) OR (sender = ? AND recipient = ?)
            ORDER BY created_at ASC
        `);
        const messages = stmt.all(user, withUser, withUser, user);
        res.json({ success: true, data: messages });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '获取对话失败' });
    }
});

// 🌟 【新增：发送私信】
app.post('/api/messages', (req, res) => {
    const { sender, recipient, message } = req.body;
    
    if (!sender || !recipient || !message) {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    
    try {
        const stmt = db.prepare("INSERT INTO messages (sender, recipient, message) VALUES (?, ?, ?)");
        stmt.run(sender, recipient, message);
        res.json({ success: true, message: '消息已发送' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: '发送失败' });
    }
});

// 🌟 【新增：浏览帖子时更新热度】
app.put('/api/posts/:id/view', (req, res) => {
    const postId = req.params.id;
    try {
        db.prepare("UPDATE posts SET popularity = popularity + 1 WHERE id = ?").run(postId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// 启动服务器
const port = 3000;
app.listen(port, () => {
    console.log(`🚀 后端服务器已启动！运行在 http://localhost:${port}`);
    console.log(`📦 已成功使用 Node.js 原生 SQLite 数据库！`);
});