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

    -- 团队项目主表：承载发起-招募-执行-结项全生命周期
    CREATE TABLE IF NOT EXISTS team_projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER UNIQUE,
        owner TEXT,
        title TEXT,
        status TEXT DEFAULT 'recruiting',
        started_at DATETIME,
        ended_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 入队成员（仅被接受的申请人才会写入）
    CREATE TABLE IF NOT EXISTS team_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        user_name TEXT,
        role TEXT DEFAULT 'member',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, user_name)
    );

    -- 团队里程碑节点
    CREATE TABLE IF NOT EXISTS milestones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        title TEXT,
        due_date TEXT,
        status TEXT DEFAULT 'pending',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME
    );

    -- 团队进度打卡
    CREATE TABLE IF NOT EXISTS checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        user_name TEXT,
        progress_note TEXT,
        attendance INTEGER DEFAULT 1,
        task_completion INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 项目内主观互评（仅队内成员，且项目结项后）
    CREATE TABLE IF NOT EXISTS peer_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        reviewer TEXT,
        reviewee TEXT,
        score INTEGER,
        comment TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, reviewer, reviewee)
    );

    -- 项目监督事件流（风险、阻塞、变更等）
    CREATE TABLE IF NOT EXISTS project_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        actor TEXT,
        event_type TEXT,
        title TEXT,
        detail TEXT,
        severity TEXT DEFAULT 'medium',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 项目反馈闭环（提交 -> 处理 -> 复开）
    CREATE TABLE IF NOT EXISTS project_feedback (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        author TEXT,
        target_user TEXT,
        category TEXT DEFAULT 'general',
        content TEXT,
        status TEXT DEFAULT 'open',
        resolution_note TEXT DEFAULT '',
        resolved_by TEXT,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

function hasColumn(tableName, columnName) {
    const rows = db.prepare(`PRAGMA table_info(${tableName})`).all();
    return rows.some((row) => row.name === columnName);
}

if (!hasColumn('applications', 'status')) {
    db.exec("ALTER TABLE applications ADD COLUMN status TEXT DEFAULT 'pending';");
}
if (!hasColumn('applications', 'decided_at')) {
    db.exec("ALTER TABLE applications ADD COLUMN decided_at DATETIME;");
}
if (!hasColumn('reviews', 'project_id')) {
    db.exec('ALTER TABLE reviews ADD COLUMN project_id INTEGER;');
}
if (!hasColumn('reviews', 'objective_score')) {
    db.exec('ALTER TABLE reviews ADD COLUMN objective_score REAL;');
}
if (!hasColumn('reviews', 'subjective_score')) {
    db.exec('ALTER TABLE reviews ADD COLUMN subjective_score REAL;');
}
if (!hasColumn('reviews', 'final_score')) {
    db.exec('ALTER TABLE reviews ADD COLUMN final_score REAL;');
}

function getProjectByPostId(postId) {
    return db.prepare('SELECT * FROM team_projects WHERE post_id = ?').get(postId);
}

function ensureProjectForRecruitingPost(postRow) {
    if (!postRow || postRow.type !== '寻人组队') return null;

    let project = getProjectByPostId(postRow.id);
    if (!project) {
        db.prepare('INSERT INTO team_projects (post_id, owner, title, status) VALUES (?, ?, ?, ?)')
            .run(postRow.id, postRow.author, postRow.title, 'recruiting');
        project = getProjectByPostId(postRow.id);
    }

    db.prepare('INSERT OR IGNORE INTO team_members (project_id, user_name, role) VALUES (?, ?, ?)')
        .run(project.id, postRow.author, 'leader');

    return project;
}

function isProjectMember(projectId, userName) {
    const row = db.prepare('SELECT id FROM team_members WHERE project_id = ? AND user_name = ?').get(projectId, userName);
    return !!row;
}

function isProjectOwner(projectId, userName) {
    const row = db.prepare('SELECT id FROM team_projects WHERE id = ? AND owner = ?').get(projectId, userName);
    return !!row;
}

function logProjectEvent(projectId, actor, eventType, title, detail, severity = 'medium') {
    db.prepare(`
        INSERT INTO project_events (project_id, actor, event_type, title, detail, severity)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(projectId, actor || '', eventType || 'note', title || '', detail || '', severity || 'medium');
}

function getObjectiveScore(projectId, userName) {
    const memberCheckins = db.prepare('SELECT COUNT(*) AS count FROM checkins WHERE project_id = ? AND user_name = ?').get(projectId, userName).count || 0;
    const maxCheckins = db.prepare(`
        SELECT MAX(cnt) AS max_cnt FROM (
            SELECT user_name, COUNT(*) AS cnt
            FROM checkins
            WHERE project_id = ?
            GROUP BY user_name
        )
    `).get(projectId).max_cnt || 0;
    const completionRow = db.prepare('SELECT AVG(task_completion) AS avg_completion FROM checkins WHERE project_id = ? AND user_name = ?').get(projectId, userName);
    const avgCompletion = completionRow && completionRow.avg_completion ? completionRow.avg_completion : 0;

    const checkinRate = maxCheckins > 0 ? memberCheckins / maxCheckins : 0;
    const objectiveScore = checkinRate * 50 + avgCompletion * 0.5;

    return {
        checkinRate,
        avgCompletion,
        objectiveScore
    };
}

function buildProjectScoreboard(projectId) {
    const members = db.prepare('SELECT user_name, role FROM team_members WHERE project_id = ? ORDER BY role DESC, joined_at ASC').all(projectId);
    return members.map((member) => {
        const objective = getObjectiveScore(projectId, member.user_name);
        const subjectiveRow = db.prepare('SELECT AVG(score) AS avg_score, COUNT(*) AS score_count FROM peer_scores WHERE project_id = ? AND reviewee = ?').get(projectId, member.user_name);
        const subjectiveScoreRaw = subjectiveRow && subjectiveRow.avg_score ? subjectiveRow.avg_score : 0;
        const subjectiveScore = subjectiveScoreRaw * 20;
        const finalScore = objective.objectiveScore * 0.6 + subjectiveScore * 0.4;

        return {
            user_name: member.user_name,
            role: member.role,
            checkin_rate: Number((objective.checkinRate * 100).toFixed(1)),
            task_completion_avg: Number(objective.avgCompletion.toFixed(1)),
            objective_score: Number(objective.objectiveScore.toFixed(1)),
            subjective_score: Number(subjectiveScore.toFixed(1)),
            final_score: Number(finalScore.toFixed(1)),
            subjective_count: subjectiveRow && subjectiveRow.score_count ? subjectiveRow.score_count : 0
        };
    });
}

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
        const result = stmt.run(author, title, content, type, location || '', compensation || '');

        if (type === '寻人组队') {
            const postRow = db.prepare('SELECT * FROM posts WHERE id = ?').get(result.lastInsertRowid);
            ensureProjectForRecruitingPost(postRow);
        }

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
            const myApps = db.prepare("SELECT id, post_id, status FROM applications WHERE applicant_name = ?").all(currentUser);
            const myAppMap = new Map(myApps.map(a => [a.post_id, a]));
            
            // 给每条帖子打上标记：有没有在我的报名集合里？
            posts.forEach(post => {
                const myApp = myAppMap.get(post.id);
                post.has_applied = !!myApp;
                post.my_application_status = myApp ? myApp.status : null;
                post.my_application_id = myApp ? myApp.id : null;
            });
        }
        
        // 🌟 为每个帖子计算已报名人数
        posts.forEach(post => {
            const appCount = db.prepare("SELECT COUNT(*) as count FROM applications WHERE post_id = ?").get(post.id);
            post.applicant_count = appCount ? appCount.count : 0;

            const acceptedCount = db.prepare("SELECT COUNT(*) as count FROM applications WHERE post_id = ? AND status = 'accepted'").get(post.id);
            post.accepted_count = acceptedCount ? acceptedCount.count : 0;

            if (post.type === '寻人组队') {
                const project = ensureProjectForRecruitingPost(post);
                post.project_status = project ? project.status : 'recruiting';
            }
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
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(post_id);
        if (!post) return res.status(404).json({ success: false, message: '帖子不存在' });
        if (post.author === applicant_name) return res.status(400).json({ success: false, message: '不能报名自己的帖子' });

        if (post.type === '寻人组队') {
            const project = ensureProjectForRecruitingPost(post);
            if (project.status !== 'recruiting') {
                return res.status(400).json({ success: false, message: '当前项目已结束招募，暂不能报名' });
            }
        }

        const exists = db.prepare('SELECT id FROM applications WHERE post_id = ? AND applicant_name = ?').get(post_id, applicant_name);
        if (exists) {
            return res.status(400).json({ success: false, message: '你已提交过申请，请勿重复报名' });
        }

        const stmt = db.prepare("INSERT INTO applications (post_id, applicant_name, message, status) VALUES (?, ?, ?, 'pending')");
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
                applications.id AS application_id,
                applications.post_id,
                applications.applicant_name, 
                applications.message, 
                applications.status,
                applications.created_at, 
                posts.title,
                posts.type
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

        const project = db.prepare('SELECT id FROM team_projects WHERE post_id = ?').get(postId);
        if (project) {
            db.prepare('DELETE FROM team_members WHERE project_id = ?').run(project.id);
            db.prepare('DELETE FROM milestones WHERE project_id = ?').run(project.id);
            db.prepare('DELETE FROM checkins WHERE project_id = ?').run(project.id);
            db.prepare('DELETE FROM peer_scores WHERE project_id = ?').run(project.id);
            db.prepare('DELETE FROM team_projects WHERE id = ?').run(project.id);
        }

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

        const reviews = db.prepare(`
            SELECT reviewer, reviewee, rating, comment, created_at, project_id, objective_score, subjective_score, final_score
            FROM reviews
            WHERE reviewee = ? AND project_id IS NOT NULL
            ORDER BY created_at DESC
        `).all(username);

        let avgFinalScore = 0;
        let avgStar = 0;
        if (reviews.length > 0) {
            const sumFinal = reviews.reduce((acc, curr) => acc + (curr.final_score || 0), 0);
            avgFinalScore = Number((sumFinal / reviews.length).toFixed(1));
            avgStar = Number((avgFinalScore / 20).toFixed(2));
        }

        res.json({ success: true, data: user, reviews: reviews, avgFinalScore, avgStar });
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

// 4. 审批报名（通过后自动入队）
app.post('/api/applications/:id/decision', (req, res) => {
    const applicationId = req.params.id;
    const { owner, decision } = req.body;

    if (!['accepted', 'rejected'].includes(decision)) {
        return res.status(400).json({ success: false, message: 'decision 仅支持 accepted/rejected' });
    }

    try {
        const appRow = db.prepare('SELECT * FROM applications WHERE id = ?').get(applicationId);
        if (!appRow) return res.status(404).json({ success: false, message: '申请记录不存在' });
        if (appRow.status !== 'pending') return res.status(400).json({ success: false, message: '该申请已处理' });

        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(appRow.post_id);
        if (!post) return res.status(404).json({ success: false, message: '关联帖子不存在' });
        if (post.author !== owner) return res.status(403).json({ success: false, message: '无权审批该申请' });

        if (post.type === '寻人组队') {
            const project = ensureProjectForRecruitingPost(post);
            if (project.status !== 'recruiting') {
                return res.status(400).json({ success: false, message: '当前项目非招募阶段，不能继续审批' });
            }
            if (decision === 'accepted') {
                db.prepare('INSERT OR IGNORE INTO team_members (project_id, user_name, role) VALUES (?, ?, ?)')
                    .run(project.id, appRow.applicant_name, 'member');
            }
        }

        db.prepare('UPDATE applications SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(decision, applicationId);

        res.json({ success: true, message: decision === 'accepted' ? '已通过并加入队伍' : '已拒绝该申请' });
    } catch (err) {
        res.status(500).json({ success: false, message: '审批失败' });
    }
});

// 5. 我的项目列表
app.get('/api/my-projects', (req, res) => {
    const currentUser = req.query.user;
    if (!currentUser) return res.status(400).json({ success: false, message: '缺少 user 参数' });

    try {
        const projects = db.prepare(`
            SELECT DISTINCT tp.*, p.type, p.title AS post_title
            FROM team_projects tp
            JOIN posts p ON p.id = tp.post_id
            JOIN team_members tm ON tm.project_id = tp.id
            WHERE tm.user_name = ?
            ORDER BY tp.created_at DESC
        `).all(currentUser);

        const withCounts = projects.map((project) => {
            const memberCount = db.prepare('SELECT COUNT(*) AS count FROM team_members WHERE project_id = ?').get(project.id).count || 0;
            const milestoneCount = db.prepare('SELECT COUNT(*) AS count FROM milestones WHERE project_id = ?').get(project.id).count || 0;
            const completedMilestoneCount = db.prepare("SELECT COUNT(*) AS count FROM milestones WHERE project_id = ? AND status = 'completed'").get(project.id).count || 0;
            return {
                ...project,
                member_count: memberCount,
                milestone_count: milestoneCount,
                completed_milestone_count: completedMilestoneCount
            };
        });

        res.json({ success: true, data: withCounts });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取项目列表失败' });
    }
});

// 5.5 团队预览卡片（大厅流程预览）
app.get('/api/projects-preview', (req, res) => {
    const currentUser = req.query.user;
    if (!currentUser) return res.status(400).json({ success: false, message: '缺少 user 参数' });

    try {
        const projects = db.prepare(`
            SELECT DISTINCT tp.id, tp.title, tp.status, tp.owner, tp.created_at
            FROM team_projects tp
            JOIN team_members tm ON tm.project_id = tp.id
            WHERE tm.user_name = ?
            ORDER BY tp.created_at DESC
            LIMIT 12
        `).all(currentUser);

        const data = projects.map((project) => {
            const memberCount = db.prepare('SELECT COUNT(*) AS count FROM team_members WHERE project_id = ?').get(project.id).count || 0;
            const pendingMilestones = db.prepare("SELECT COUNT(*) AS count FROM milestones WHERE project_id = ? AND status = 'pending'").get(project.id).count || 0;
            const recentCheckin = db.prepare('SELECT user_name, task_completion, created_at FROM checkins WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').get(project.id);
            return {
                ...project,
                member_count: memberCount,
                pending_milestones: pendingMilestones,
                recent_checkin: recentCheckin || null,
                can_manage: project.owner === currentUser
            };
        });

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取项目预览失败' });
    }
});

// 6. 项目详情（成员、里程碑、打卡、评分看板）
app.get('/api/projects/:id/detail', (req, res) => {
    const projectId = req.params.id;
    const currentUser = req.query.user;

    try {
        const project = db.prepare('SELECT * FROM team_projects WHERE id = ?').get(projectId);
        if (!project) return res.status(404).json({ success: false, message: '项目不存在' });
        if (!isProjectMember(projectId, currentUser)) {
            return res.status(403).json({ success: false, message: '仅项目成员可查看协作详情' });
        }

        const members = db.prepare('SELECT user_name, role, joined_at FROM team_members WHERE project_id = ? ORDER BY role DESC, joined_at ASC').all(projectId);
        const milestones = db.prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at ASC').all(projectId);
        const checkins = db.prepare('SELECT * FROM checkins WHERE project_id = ? ORDER BY created_at DESC LIMIT 50').all(projectId);
        const scoreboard = buildProjectScoreboard(projectId);

        res.json({
            success: true,
            data: {
                project,
                members,
                milestones,
                checkins,
                scoreboard,
                can_manage: isProjectOwner(projectId, currentUser),
                is_member: true
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取项目详情失败' });
    }
});

// 7. 更新项目状态（生命周期：recruiting -> executing -> completed）
app.put('/api/projects/:id/status', (req, res) => {
    const projectId = req.params.id;
    const { actor, status } = req.body;
    const allowed = ['recruiting', 'executing', 'completed'];
    if (!allowed.includes(status)) return res.status(400).json({ success: false, message: '状态不合法' });

    try {
        const project = db.prepare('SELECT * FROM team_projects WHERE id = ?').get(projectId);
        if (!project) return res.status(404).json({ success: false, message: '项目不存在' });
        if (project.owner !== actor) return res.status(403).json({ success: false, message: '仅队长可修改项目状态' });

        if (status === 'executing' && !project.started_at) {
            db.prepare('UPDATE team_projects SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, projectId);
        } else if (status === 'completed') {
            db.prepare('UPDATE team_projects SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, projectId);
        } else {
            db.prepare('UPDATE team_projects SET status = ? WHERE id = ?').run(status, projectId);
        }

        logProjectEvent(projectId, actor, 'status', '项目状态变更', `状态更新为 ${status}`, status === 'completed' ? 'high' : 'medium');

        res.json({ success: true, message: '项目状态已更新' });
    } catch (err) {
        res.status(500).json({ success: false, message: '状态更新失败' });
    }
});

// 8. 新增里程碑
app.post('/api/projects/:id/milestones', (req, res) => {
    const projectId = req.params.id;
    const { actor, title, due_date } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ success: false, message: '里程碑标题不能为空' });

    try {
        if (!isProjectOwner(projectId, actor)) return res.status(403).json({ success: false, message: '仅队长可新增里程碑' });
        db.prepare('INSERT INTO milestones (project_id, title, due_date, created_by) VALUES (?, ?, ?, ?)')
            .run(projectId, title.trim(), due_date || '', actor);
        logProjectEvent(projectId, actor, 'milestone', '新增里程碑', `${title.trim()}${due_date ? `（截止 ${due_date}）` : ''}`, 'low');
        res.json({ success: true, message: '里程碑已创建' });
    } catch (err) {
        res.status(500).json({ success: false, message: '里程碑创建失败' });
    }
});

// 9. 更新里程碑状态
app.put('/api/projects/:id/milestones/:mid', (req, res) => {
    const projectId = req.params.id;
    const milestoneId = req.params.mid;
    const { actor, status } = req.body;
    if (!['pending', 'completed'].includes(status)) {
        return res.status(400).json({ success: false, message: '里程碑状态不合法' });
    }

    try {
        if (!isProjectOwner(projectId, actor)) return res.status(403).json({ success: false, message: '仅队长可更新里程碑状态' });
        const milestone = db.prepare('SELECT * FROM milestones WHERE id = ? AND project_id = ?').get(milestoneId, projectId);
        if (!milestone) return res.status(404).json({ success: false, message: '里程碑不存在' });

        if (status === 'completed') {
            db.prepare('UPDATE milestones SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, milestoneId);
        } else {
            db.prepare('UPDATE milestones SET status = ?, completed_at = NULL WHERE id = ?').run(status, milestoneId);
        }

        logProjectEvent(projectId, actor, 'milestone', '里程碑状态更新', `${milestone.title} -> ${status}`, status === 'completed' ? 'medium' : 'low');

        res.json({ success: true, message: '里程碑状态已更新' });
    } catch (err) {
        res.status(500).json({ success: false, message: '里程碑更新失败' });
    }
});

// 10. 团队成员打卡
app.post('/api/projects/:id/checkins', (req, res) => {
    const projectId = req.params.id;
    const { user, progress_note, task_completion } = req.body;
    const completion = Number(task_completion);

    if (!isProjectMember(projectId, user)) {
        return res.status(403).json({ success: false, message: '仅已加入队伍的成员可打卡' });
    }
    if (Number.isNaN(completion) || completion < 0 || completion > 100) {
        return res.status(400).json({ success: false, message: '任务完成度需为 0-100 之间的数字' });
    }

    try {
        db.prepare('INSERT INTO checkins (project_id, user_name, progress_note, attendance, task_completion) VALUES (?, ?, ?, 1, ?)')
            .run(projectId, user, (progress_note || '').trim(), completion);
        logProjectEvent(projectId, user, 'checkin', '成员打卡', `完成度 ${completion}%`, completion < 40 ? 'high' : 'low');
        res.json({ success: true, message: '打卡成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '打卡失败' });
    }
});

// 10.5 删除打卡记录（发布者/队长可删，打卡本人可删）
app.delete('/api/projects/:id/checkins/:checkinId', (req, res) => {
    const projectId = req.params.id;
    const checkinId = req.params.checkinId;
    const { actor } = req.body;

    try {
        const checkin = db.prepare('SELECT * FROM checkins WHERE id = ? AND project_id = ?').get(checkinId, projectId);
        if (!checkin) return res.status(404).json({ success: false, message: '打卡记录不存在' });

        const canDelete = isProjectOwner(projectId, actor) || checkin.user_name === actor;
        if (!canDelete) return res.status(403).json({ success: false, message: '仅发布者/队长或记录本人可删除打卡' });

        db.prepare('DELETE FROM checkins WHERE id = ?').run(checkinId);
        logProjectEvent(projectId, actor, 'checkin', '删除打卡记录', `删除了 ${checkin.user_name} 的打卡（完成度 ${checkin.task_completion}%）`, 'medium');

        res.json({ success: true, message: '打卡记录已删除' });
    } catch (err) {
        res.status(500).json({ success: false, message: '删除打卡失败' });
    }
});

// 10.7 新增监督事件
app.post('/api/projects/:id/events', (req, res) => {
    const projectId = req.params.id;
    const { actor, event_type, title, detail, severity } = req.body;

    if (!title || !title.trim()) return res.status(400).json({ success: false, message: '事件标题不能为空' });
    if (!isProjectMember(projectId, actor)) return res.status(403).json({ success: false, message: '仅成员可上报事件' });

    const level = ['low', 'medium', 'high'].includes(severity) ? severity : 'medium';

    try {
        db.prepare(`
            INSERT INTO project_events (project_id, actor, event_type, title, detail, severity)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(projectId, actor, event_type || 'note', title.trim(), (detail || '').trim(), level);

        res.json({ success: true, message: '监督事件已记录' });
    } catch (err) {
        res.status(500).json({ success: false, message: '事件记录失败' });
    }
});

// 10.8 获取监督事件流
app.get('/api/projects/:id/events', (req, res) => {
    const projectId = req.params.id;
    const currentUser = req.query.user;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));

    if (!isProjectMember(projectId, currentUser)) {
        return res.status(403).json({ success: false, message: '仅成员可查看监督事件' });
    }

    try {
        const rows = db.prepare('SELECT * FROM project_events WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取事件流失败' });
    }
});

// 10.9 新增项目反馈
app.post('/api/projects/:id/feedback', (req, res) => {
    const projectId = req.params.id;
    const { actor, target_user, category, content } = req.body;

    if (!content || !content.trim()) return res.status(400).json({ success: false, message: '反馈内容不能为空' });
    if (!isProjectMember(projectId, actor)) return res.status(403).json({ success: false, message: '仅成员可提交反馈' });
    if (target_user && !isProjectMember(projectId, target_user)) return res.status(400).json({ success: false, message: '目标成员不在项目内' });

    try {
        db.prepare(`
            INSERT INTO project_feedback (project_id, author, target_user, category, content)
            VALUES (?, ?, ?, ?, ?)
        `).run(projectId, actor, target_user || '', category || 'general', content.trim());

        logProjectEvent(projectId, actor, 'feedback', '提交项目反馈', content.trim().slice(0, 36), 'medium');

        res.json({ success: true, message: '反馈已提交' });
    } catch (err) {
        res.status(500).json({ success: false, message: '提交反馈失败' });
    }
});

// 10.10 获取反馈列表
app.get('/api/projects/:id/feedback', (req, res) => {
    const projectId = req.params.id;
    const currentUser = req.query.user;

    if (!isProjectMember(projectId, currentUser)) {
        return res.status(403).json({ success: false, message: '仅成员可查看反馈' });
    }

    try {
        const rows = db.prepare('SELECT * FROM project_feedback WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
        res.json({ success: true, data: rows, can_manage: isProjectOwner(projectId, currentUser) });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取反馈失败' });
    }
});

// 10.11 处理反馈（仅发布者/队长）
app.put('/api/projects/:id/feedback/:fid', (req, res) => {
    const projectId = req.params.id;
    const feedbackId = req.params.fid;
    const { actor, status, resolution_note } = req.body;

    if (!['open', 'resolved'].includes(status)) return res.status(400).json({ success: false, message: '反馈状态不合法' });
    if (!isProjectOwner(projectId, actor)) return res.status(403).json({ success: false, message: '仅发布者/队长可处理反馈' });

    try {
        const row = db.prepare('SELECT * FROM project_feedback WHERE id = ? AND project_id = ?').get(feedbackId, projectId);
        if (!row) return res.status(404).json({ success: false, message: '反馈记录不存在' });

        if (status === 'resolved') {
            db.prepare(`
                UPDATE project_feedback
                SET status = 'resolved', resolution_note = ?, resolved_by = ?, resolved_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run((resolution_note || '').trim(), actor, feedbackId);
        } else {
            db.prepare(`
                UPDATE project_feedback
                SET status = 'open', resolution_note = ?, resolved_by = NULL, resolved_at = NULL
                WHERE id = ?
            `).run((resolution_note || '').trim(), feedbackId);
        }

        logProjectEvent(projectId, actor, 'feedback', '反馈状态更新', `#${feedbackId} -> ${status}`, status === 'resolved' ? 'low' : 'medium');

        res.json({ success: true, message: '反馈状态已更新' });
    } catch (err) {
        res.status(500).json({ success: false, message: '反馈更新失败' });
    }
});

// 10.12 删除/撤回反馈（反馈发起者可撤回，发布者/队长可删除）
app.delete('/api/projects/:id/feedback/:fid', (req, res) => {
    const projectId = req.params.id;
    const feedbackId = req.params.fid;
    const { actor } = req.body;

    if (!isProjectMember(projectId, actor)) {
        return res.status(403).json({ success: false, message: '仅成员可操作反馈' });
    }

    try {
        const row = db.prepare('SELECT * FROM project_feedback WHERE id = ? AND project_id = ?').get(feedbackId, projectId);
        if (!row) return res.status(404).json({ success: false, message: '反馈记录不存在' });

        const canDelete = row.author === actor || isProjectOwner(projectId, actor);
        if (!canDelete) {
            return res.status(403).json({ success: false, message: '仅反馈发起者或发布者/队长可删除' });
        }

        db.prepare('DELETE FROM project_feedback WHERE id = ?').run(feedbackId);
        logProjectEvent(projectId, actor, 'feedback', '删除反馈', `删除反馈 #${feedbackId}`, 'low');

        res.json({ success: true, message: row.author === actor ? '反馈已撤回' : '反馈已删除' });
    } catch (err) {
        res.status(500).json({ success: false, message: '反馈删除失败' });
    }
});

// 10.6 项目轻量概览（主页流程预览）
app.get('/api/projects/:id/overview', (req, res) => {
    const projectId = req.params.id;
    const currentUser = req.query.user;

    try {
        const project = db.prepare('SELECT * FROM team_projects WHERE id = ?').get(projectId);
        if (!project) return res.status(404).json({ success: false, message: '项目不存在' });
        if (!isProjectMember(projectId, currentUser)) {
            return res.status(403).json({ success: false, message: '仅项目成员可查看概览' });
        }

        const memberCount = db.prepare('SELECT COUNT(*) AS count FROM team_members WHERE project_id = ?').get(projectId).count || 0;
        const milestoneStats = db.prepare(`
            SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
            FROM milestones WHERE project_id = ?
        `).get(projectId);
        const recentCheckins = db.prepare('SELECT id, user_name, task_completion, progress_note, created_at FROM checkins WHERE project_id = ? ORDER BY created_at DESC LIMIT 5').all(projectId);
        const recentEvents = db.prepare('SELECT id, actor, event_type, title, severity, created_at FROM project_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 5').all(projectId);
        const openFeedback = db.prepare("SELECT COUNT(*) AS count FROM project_feedback WHERE project_id = ? AND status = 'open'").get(projectId).count || 0;

        res.json({
            success: true,
            data: {
                project,
                member_count: memberCount,
                milestone_total: milestoneStats.total || 0,
                milestone_completed: milestoneStats.completed || 0,
                recent_checkins: recentCheckins,
                recent_events: recentEvents,
                open_feedback: openFeedback,
                can_manage: isProjectOwner(projectId, currentUser)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取项目概览失败' });
    }
});

// 11. 项目结项后互评（主观评分）
app.post('/api/projects/:id/ratings', (req, res) => {
    const projectId = req.params.id;
    const { reviewer, reviewee, score, comment } = req.body;
    const numericScore = Number(score);

    if (!Number.isInteger(numericScore) || numericScore < 1 || numericScore > 5) {
        return res.status(400).json({ success: false, message: '评分必须为 1-5 的整数' });
    }
    if (reviewer === reviewee) {
        return res.status(400).json({ success: false, message: '不能给自己打分' });
    }

    try {
        const project = db.prepare('SELECT * FROM team_projects WHERE id = ?').get(projectId);
        if (!project) return res.status(404).json({ success: false, message: '项目不存在' });
        if (project.status !== 'completed') {
            return res.status(400).json({ success: false, message: '仅项目结项后允许互评' });
        }
        if (!isProjectMember(projectId, reviewer) || !isProjectMember(projectId, reviewee)) {
            return res.status(403).json({ success: false, message: '仅已加入队伍的成员可参与互评' });
        }

        db.prepare(`
            INSERT INTO peer_scores (project_id, reviewer, reviewee, score, comment)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(project_id, reviewer, reviewee)
            DO UPDATE SET score = excluded.score, comment = excluded.comment, created_at = CURRENT_TIMESTAMP
        `).run(projectId, reviewer, reviewee, numericScore, (comment || '').trim());

        const targetObjective = getObjectiveScore(projectId, reviewee);
        const subjectiveRow = db.prepare('SELECT AVG(score) AS avg_score FROM peer_scores WHERE project_id = ? AND reviewee = ?').get(projectId, reviewee);
        const subjectiveScore = (subjectiveRow && subjectiveRow.avg_score ? subjectiveRow.avg_score : 0) * 20;
        const finalScore = targetObjective.objectiveScore * 0.6 + subjectiveScore * 0.4;

        db.prepare('INSERT INTO reviews (reviewer, reviewee, rating, comment, project_id, objective_score, subjective_score, final_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .run(reviewer, reviewee, numericScore, `[项目#${projectId}] ${(comment || '').trim()}`, projectId, Number(targetObjective.objectiveScore.toFixed(1)), Number(subjectiveScore.toFixed(1)), Number(finalScore.toFixed(1)));

        logProjectEvent(projectId, reviewer, 'rating', '提交互评', `${reviewer} -> ${reviewee}：${numericScore}分`, 'low');

        res.json({ success: true, message: '互评已提交', data: { objective_score: targetObjective.objectiveScore, subjective_score: subjectiveScore, final_score: finalScore } });
    } catch (err) {
        res.status(500).json({ success: false, message: '互评提交失败' });
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