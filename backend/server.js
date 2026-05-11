const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const OpenAI = require('openai');
// 【魔法在这里】直接引入 Node.js 原生自带的 SQLite，无需任何 npm 安装！
const { DatabaseSync } = require('node:sqlite');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const ALLOWED_CAMPUSES = ['沙河校区', '西土城校区'];
const RECOMMENDATION_WEIGHTS = {
    skill: 0.24,
    interest: 0.14,
    mbti: 0.07,
    semantic: 0.23,
    success: 0.09,
    behavior: 0.13,
    freshness: 0.06,
    activity: 0.04
};

const ZHIPU_API_KEY = String(process.env.ZHIPU_API_KEY || '').trim();
const ZHIPU_BASE_URL = String(process.env.ZHIPU_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').trim();
const ZHIPU_MODEL = String(process.env.ZHIPU_MODEL || 'glm-4.7-flash').trim();
const AI_RERANK_TIMEOUT_MS = Math.max(600, Number(process.env.AI_RERANK_TIMEOUT_MS || 1800));
const AI_RERANK_CACHE_TTL_MS = Math.max(3000, Number(process.env.AI_RERANK_CACHE_TTL_MS || 45000));
const CIRCLE_PROPOSAL_SUPPORT_THRESHOLD = Math.max(5, Number(process.env.CIRCLE_PROPOSAL_SUPPORT_THRESHOLD || 10));
const CIRCLE_PROPOSAL_PUBLIC_DAYS = Math.max(1, Number(process.env.CIRCLE_PROPOSAL_PUBLIC_DAYS || 7));
const AI_RERANK_ENABLED = !!ZHIPU_API_KEY;
const aiRerankCache = new Map();
const aiClient = AI_RERANK_ENABLED
    ? new OpenAI({
        apiKey: ZHIPU_API_KEY,
        baseURL: ZHIPU_BASE_URL
    })
    : null;

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
        post_labels TEXT DEFAULT '[]',
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

    -- 项目需求池：一个项目下可持续发布多个需求
    CREATE TABLE IF NOT EXISTS project_requirements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        title TEXT,
        description TEXT DEFAULT '',
        status TEXT DEFAULT 'open',
        priority TEXT DEFAULT 'medium',
        assignee TEXT DEFAULT '',
        created_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 项目需求变更历史（状态流转、改派、编辑）
    CREATE TABLE IF NOT EXISTS project_requirement_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        requirement_id INTEGER,
        actor TEXT,
        action_type TEXT,
        before_data TEXT DEFAULT '{}',
        after_data TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 项目成员变更历史（新增、移除、角色变更）
    CREATE TABLE IF NOT EXISTS project_member_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER,
        actor TEXT,
        target_user TEXT,
        action_type TEXT,
        from_role TEXT DEFAULT '',
        to_role TEXT DEFAULT '',
        note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 用户多维特征画像仓库（Feature Store）
    CREATE TABLE IF NOT EXISTS user_feature_store (
        user_name TEXT PRIMARY KEY,
        hard_tags TEXT DEFAULT '{}',
        soft_tags TEXT DEFAULT '{}',
        feature_vector TEXT DEFAULT '[]',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 推荐行为事件流（曝光/浏览/申请/录用/完成）
    CREATE TABLE IF NOT EXISTS recommendation_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_name TEXT,
        post_id INTEGER,
        event_type TEXT,
        event_value REAL DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 用户偏好画像（从行为中归纳）
    CREATE TABLE IF NOT EXISTS user_preference_profile (
        user_name TEXT PRIMARY KEY,
        preferred_types TEXT DEFAULT '{}',
        preferred_campuses TEXT DEFAULT '{}',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 轻社区：圈子主表
    CREATE TABLE IF NOT EXISTS community_circles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        description TEXT DEFAULT '',
        creator TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 轻社区：圈子成员表
    CREATE TABLE IF NOT EXISTS circle_members (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        circle_id INTEGER,
        user_name TEXT,
        role TEXT DEFAULT 'member',
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(circle_id, user_name)
    );

    -- 轻社区：经验贴/复盘贴
    CREATE TABLE IF NOT EXISTS community_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author TEXT,
        circle_id INTEGER,
        title TEXT,
        content TEXT,
        post_type TEXT DEFAULT 'review',
        project_id INTEGER,
        tags TEXT DEFAULT '[]',
        likes_count INTEGER DEFAULT 0,
        comments_count INTEGER DEFAULT 0,
        views INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 轻社区：评论
    CREATE TABLE IF NOT EXISTS community_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        author TEXT,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- 轻社区：互动（先支持点赞）
    CREATE TABLE IF NOT EXISTS community_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        user_name TEXT,
        reaction_type TEXT DEFAULT 'like',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_name, reaction_type)
    );

    CREATE TABLE IF NOT EXISTS circle_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        proposer TEXT,
        status TEXT DEFAULT 'pending',
        public_until DATETIME,
        approved_circle_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(name, status)
    );

    CREATE TABLE IF NOT EXISTS circle_proposal_supports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proposal_id INTEGER,
        user_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(proposal_id, user_name)
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
if (!hasColumn('users', 'campus')) {
    db.exec("ALTER TABLE users ADD COLUMN campus TEXT DEFAULT ''; ");
}
if (!hasColumn('users', 'available_hours')) {
    db.exec('ALTER TABLE users ADD COLUMN available_hours INTEGER DEFAULT 0;');
}
if (!hasColumn('users', 'mbti')) {
    db.exec("ALTER TABLE users ADD COLUMN mbti TEXT DEFAULT ''; ");
}
if (!hasColumn('users', 'interests')) {
    db.exec("ALTER TABLE users ADD COLUMN interests TEXT DEFAULT ''; ");
}
if (!hasColumn('posts', 'collaboration_mode')) {
    db.exec("ALTER TABLE posts ADD COLUMN collaboration_mode TEXT DEFAULT 'online';");
}
if (!hasColumn('posts', 'campus')) {
    db.exec("ALTER TABLE posts ADD COLUMN campus TEXT DEFAULT ''; ");
}
if (!hasColumn('posts', 'expected_hours')) {
    db.exec('ALTER TABLE posts ADD COLUMN expected_hours INTEGER DEFAULT 0;');
}
if (!hasColumn('posts', 'structured_tags')) {
    db.exec("ALTER TABLE posts ADD COLUMN structured_tags TEXT DEFAULT '{}';");
}
if (!hasColumn('posts', 'feature_vector')) {
    db.exec("ALTER TABLE posts ADD COLUMN feature_vector TEXT DEFAULT '[]';");
}
if (!hasColumn('posts', 'accept_cross_campus')) {
    db.exec('ALTER TABLE posts ADD COLUMN accept_cross_campus INTEGER DEFAULT 0;');
}
if (!hasColumn('posts', 'off_campus_location')) {
    db.exec("ALTER TABLE posts ADD COLUMN off_campus_location TEXT DEFAULT ''; ");
}
if (!hasColumn('posts', 'requires_management')) {
    db.exec('ALTER TABLE posts ADD COLUMN requires_management INTEGER DEFAULT 0;');
}
if (!hasColumn('posts', 'post_labels')) {
    db.exec("ALTER TABLE posts ADD COLUMN post_labels TEXT DEFAULT '[]';");
}

function getProjectByPostId(postId) {
    return db.prepare('SELECT * FROM team_projects WHERE post_id = ?').get(postId);
}

function ensureProjectForRecruitingPost(postRow) {
    if (!postRow || postRow.type !== '寻人组队') return null;
    if (Number(postRow.requires_management || 0) !== 1) return null;

    let project = getProjectByPostId(postRow.id);
    if (!project) {
        db.prepare('INSERT INTO team_projects (post_id, owner, title, status) VALUES (?, ?, ?, ?)')
            .run(postRow.id, postRow.author, postRow.title, 'recruiting');
        project = getProjectByPostId(postRow.id);
    }

    const before = db.prepare('SELECT role FROM team_members WHERE project_id = ? AND user_name = ?').get(project.id, postRow.author);
    db.prepare('INSERT OR IGNORE INTO team_members (project_id, user_name, role) VALUES (?, ?, ?)')
        .run(project.id, postRow.author, 'leader');
    if (!before) {
        logProjectMemberHistory(project.id, postRow.author, postRow.author, 'join', '', 'leader', '项目创建人自动入队');
    }

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

function normalizeProjectRole(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'leader') return 'leader';
    if (normalized === 'core_member' || normalized === 'core') return 'core_member';
    return 'member';
}

function isProjectLeader(projectId, userName) {
    if (!userName) return false;
    const row = db.prepare('SELECT role FROM team_members WHERE project_id = ? AND user_name = ?').get(projectId, userName);
    if (!row) return false;
    return row.role === 'leader' || isProjectOwner(projectId, userName);
}

function logProjectEvent(projectId, actor, eventType, title, detail, severity = 'medium') {
    db.prepare(`
        INSERT INTO project_events (project_id, actor, event_type, title, detail, severity)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(projectId, actor || '', eventType || 'note', title || '', detail || '', severity || 'medium');
}

function logProjectMemberHistory(projectId, actor, targetUser, actionType, fromRole, toRole, note = '') {
    db.prepare(`
        INSERT INTO project_member_history (project_id, actor, target_user, action_type, from_role, to_role, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(projectId, actor || '', targetUser || '', actionType || '', fromRole || '', toRole || '', note || '');
}

function logRequirementHistory(projectId, requirementId, actor, actionType, beforeData, afterData) {
    db.prepare(`
        INSERT INTO project_requirement_history (project_id, requirement_id, actor, action_type, before_data, after_data)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        projectId,
        requirementId,
        actor || '',
        actionType || '',
        JSON.stringify(beforeData || {}),
        JSON.stringify(afterData || {})
    );
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
    const members = db.prepare(`
        SELECT user_name, role
        FROM team_members
        WHERE project_id = ?
        ORDER BY CASE role WHEN 'leader' THEN 1 WHEN 'core_member' THEN 2 ELSE 3 END, joined_at ASC
    `).all(projectId);
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

function parseTagList(text) {
    if (!text) return [];
    return String(text)
        .split(/[,，、\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function uniqueList(items) {
    return Array.from(new Set((items || []).filter(Boolean)));
}

function parsePostLabels(raw) {
    if (Array.isArray(raw)) {
        return uniqueList(raw.map((x) => String(x || '').trim()).filter(Boolean)).slice(0, 1);
    }
    if (typeof raw === 'string') {
        const parsed = safeJsonParse(raw, null);
        if (Array.isArray(parsed)) {
            return uniqueList(parsed.map((x) => String(x || '').trim()).filter(Boolean)).slice(0, 1);
        }
        return uniqueList(parseTagList(raw).map((x) => String(x || '').trim()).filter(Boolean)).slice(0, 1);
    }
    return [];
}

function normalizePostType(type, labels, requiresManagement) {
    const normalizedType = String(type || '').trim();
    const primaryLabel = String((labels && labels[0]) || '').trim();
    if (requiresManagement) return '寻人组队';
    if (['寻人组队', '提供技能'].includes(normalizedType)) return normalizedType;
    if (primaryLabel === '提供技能') return '提供技能';
    if (primaryLabel === '寻人组队') return '寻人组队';
    return '活动交流';
}

function tokenizeText(text) {
    if (!text) return [];
    const lower = String(text).toLowerCase();
    const latinTokens = lower.match(/[a-z0-9+#.]+/g) || [];
    const cjkTokens = String(text).match(/[\u4e00-\u9fa5]{2,}/g) || [];
    return [...latinTokens, ...cjkTokens];
}

function extractTagsFromText(text) {
    const tokens = tokenizeText(text);
    const hitSkills = [];
    const hitInterests = [];

    const skillDict = {
        vue: ['vue', 'vue3'],
        react: ['react', 'reactjs'],
        python: ['python', 'py'],
        javascript: ['javascript', 'js', 'node'],
        java: ['java'],
        cpp: ['c++', 'cpp'],
        剪辑: ['剪辑', '视频剪辑', 'pr', 'premiere'],
        设计: ['设计', 'ui', '海报', 'ps', 'figma'],
        摄影: ['摄影', '拍摄'],
        数据分析: ['数据分析', 'excel', 'sql', 'bi']
    };

    const interestDict = {
        音乐: ['音乐', '吉他', '乐队'],
        运动: ['运动', '篮球', '足球', '跑步'],
        游戏: ['游戏', '电竞'],
        创业: ['创业', '商业计划'],
        竞赛: ['竞赛', '比赛', '挑战杯'],
        志愿: ['志愿', '公益']
    };

    Object.entries(skillDict).forEach(([tag, aliases]) => {
        if (aliases.some((alias) => tokens.includes(alias) || String(text).toLowerCase().includes(alias))) {
            hitSkills.push(tag);
        }
    });

    Object.entries(interestDict).forEach(([tag, aliases]) => {
        if (aliases.some((alias) => tokens.includes(alias) || String(text).toLowerCase().includes(alias))) {
            hitInterests.push(tag);
        }
    });

    return {
        skills: uniqueList(hitSkills),
        interests: uniqueList(hitInterests)
    };
}

function buildHashedVector(text, dim = 24) {
    const vector = new Array(dim).fill(0);
    const tokens = tokenizeText(text);

    tokens.forEach((token) => {
        let hash = 0;
        for (let i = 0; i < token.length; i += 1) {
            hash = ((hash << 5) - hash) + token.charCodeAt(i);
            hash |= 0;
        }
        const idx = Math.abs(hash) % dim;
        vector[idx] += 1;
    });

    const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!norm) return vector;
    return vector.map((value) => Number((value / norm).toFixed(6)));
}

function cosineSimilarity(vecA, vecB) {
    const len = Math.min(vecA.length, vecB.length);
    if (!len) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < len; i += 1) {
        const a = Number(vecA[i] || 0);
        const b = Number(vecB[i] || 0);
        dot += a * b;
        normA += a * a;
        normB += b * b;
    }
    if (!normA || !normB) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function safeJsonParse(raw, fallback) {
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (err) {
        return fallback;
    }
}

function extractJsonPayload(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const direct = safeJsonParse(raw, null);
    if (direct && typeof direct === 'object') return direct;

    const fencedMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i) || raw.match(/```\s*([\s\S]*?)\s*```/i);
    if (fencedMatch && fencedMatch[1]) {
        const fenced = safeJsonParse(fencedMatch[1].trim(), null);
        if (fenced && typeof fenced === 'object') return fenced;
    }

    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        const objectLike = raw.slice(firstBrace, lastBrace + 1);
        const parsed = safeJsonParse(objectLike, null);
        if (parsed && typeof parsed === 'object') return parsed;
    }

    return null;
}

function recordRecommendationEvent(userName, postId, eventType, eventValue = 1) {
    if (!userName || !postId || !eventType) return;
    db.prepare(`
        INSERT INTO recommendation_events (user_name, post_id, event_type, event_value)
        VALUES (?, ?, ?, ?)
    `).run(String(userName), Number(postId), String(eventType), Number(eventValue || 1));
}

function upsertUserPreferenceProfile(userName) {
    if (!userName) return;

    const rows = db.prepare(`
        SELECT
            p.type,
            p.campus,
            SUM(
                CASE
                    WHEN re.event_type = 'accepted' THEN 3
                    WHEN re.event_type = 'apply' THEN 2
                    WHEN re.event_type = 'view' THEN 1
                    WHEN re.event_type = 'complete' THEN 4
                    ELSE 0
                END * COALESCE(re.event_value, 1)
            ) AS weight_sum
        FROM recommendation_events re
        JOIN posts p ON p.id = re.post_id
        WHERE re.user_name = ?
          AND re.created_at >= datetime('now', '-120 day')
        GROUP BY p.type, p.campus
    `).all(userName);

    const typeWeights = {};
    const campusWeights = {};

    rows.forEach((row) => {
        const w = Number(row.weight_sum || 0);
        if (w <= 0) return;
        const t = String(row.type || '').trim();
        const c = String(row.campus || '').trim();
        if (t) typeWeights[t] = Number(((typeWeights[t] || 0) + w).toFixed(3));
        if (c) campusWeights[c] = Number(((campusWeights[c] || 0) + w).toFixed(3));
    });

    db.prepare(`
        INSERT INTO user_preference_profile (user_name, preferred_types, preferred_campuses, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_name)
        DO UPDATE SET
            preferred_types = excluded.preferred_types,
            preferred_campuses = excluded.preferred_campuses,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        userName,
        JSON.stringify(typeWeights),
        JSON.stringify(campusWeights)
    );
}

function getUserPreferenceProfile(userName) {
    const row = db.prepare('SELECT preferred_types, preferred_campuses FROM user_preference_profile WHERE user_name = ?').get(userName);
    if (!row) return { preferred_types: {}, preferred_campuses: {} };
    return {
        preferred_types: safeJsonParse(row.preferred_types, {}),
        preferred_campuses: safeJsonParse(row.preferred_campuses, {})
    };
}

function normalizeWeightedScore(weightMap, key) {
    const entries = Object.entries(weightMap || {});
    if (!entries.length) return 0;
    const maxWeight = Math.max(...entries.map(([, v]) => Number(v || 0)), 0);
    if (!maxWeight) return 0;
    return Math.min(1, Number(weightMap[key] || 0) / maxWeight);
}

function computeBehaviorPreferenceScore(preferenceProfile, post) {
    const typeScore = normalizeWeightedScore(preferenceProfile.preferred_types || {}, String(post.type || ''));
    const campusScore = normalizeWeightedScore(preferenceProfile.preferred_campuses || {}, String(post.campus || ''));
    return Number((typeScore * 0.65 + campusScore * 0.35).toFixed(4));
}

function computeFreshnessScore(createdAtText) {
    const ts = Date.parse(String(createdAtText || ''));
    if (Number.isNaN(ts)) return 0.2;
    const ageHours = Math.max(0, (Date.now() - ts) / (1000 * 60 * 60));
    if (ageHours <= 6) return 1;
    if (ageHours <= 24) return 0.82;
    if (ageHours <= 72) return 0.64;
    if (ageHours <= 168) return 0.45;
    return 0.22;
}

function getUserActivitySummary(userName) {
    const projectRows = db.prepare(`
        SELECT tp.id, tp.title, tp.status, tp.created_at, tp.ended_at, tm.role
        FROM team_projects tp
        JOIN team_members tm ON tm.project_id = tp.id
        WHERE tm.user_name = ?
        ORDER BY tp.created_at DESC
    `).all(userName);

    const communityRows = db.prepare(`
        SELECT id, title, post_type, created_at
        FROM community_posts
        WHERE author = ?
        ORDER BY created_at DESC
        LIMIT 80
    `).all(userName);

    const ongoing = [];
    const history = [];
    const terms = [];

    projectRows.forEach((row) => {
        const item = {
            kind: '项目',
            title: row.title || `项目 #${row.id}`,
            role: row.role || 'member',
            status: row.status || 'recruiting',
            time: row.status === 'completed' ? (row.ended_at || row.created_at) : row.created_at
        };
        terms.push(item.title, item.role, item.status);
        if (row.status !== 'completed') ongoing.push(item);
        else history.push(item);
    });

    communityRows.forEach((row) => {
        const createdTs = Date.parse(String(row.created_at || ''));
        const isRecent = !Number.isNaN(createdTs) ? (Date.now() - createdTs) <= 60 * 24 * 60 * 60 * 1000 : false;
        const item = {
            kind: '社区',
            title: row.title || `社区内容 #${row.id}`,
            role: '作者',
            status: isRecent ? 'active' : 'archived',
            time: row.created_at
        };
        terms.push(item.title, row.post_type || '');
        if (isRecent) ongoing.push(item);
        else history.push(item);
    });

    return {
        ongoing: ongoing.slice(0, 20),
        history: history.slice(0, 30),
        terms: uniqueList(tokenizeText(terms.join(' '))).slice(0, 80),
        stats: {
            ongoing_count: ongoing.length,
            history_count: history.length,
            total_count: ongoing.length + history.length
        }
    };
}

function computeActivityRelevanceScore(userActivitySummary, post) {
    const activityTerms = userActivitySummary && Array.isArray(userActivitySummary.terms)
        ? userActivitySummary.terms
        : [];
    const structured = safeJsonParse(post.structured_tags || '{}', {});
    const labels = parsePostLabels(post.post_labels);
    const textExtracted = extractTagsFromText(`${post.title || ''} ${post.content || ''}`);
    const postTerms = uniqueList([
        ...(labels || []),
        ...((structured.skills || []).map(String)),
        ...((structured.interests || []).map(String)),
        ...(textExtracted.skills || []),
        ...(textExtracted.interests || [])
    ].map((x) => String(x || '').trim()).filter(Boolean));

    const termOverlap = overlapScore(activityTerms, postTerms);
    const stats = userActivitySummary && userActivitySummary.stats ? userActivitySummary.stats : {};
    const activityIntensity = Math.min(
        1,
        ((Number(stats.ongoing_count || 0) * 1.2) + (Number(stats.history_count || 0) * 0.6)) / 14
    );
    return Number((termOverlap * 0.75 + activityIntensity * 0.25).toFixed(4));
}

function buildRecommendationContext(currentUser) {
    const user = db.prepare('SELECT * FROM users WHERE name = ?').get(currentUser);
    if (!user) {
        const error = new Error('用户不存在');
        error.statusCode = 404;
        throw error;
    }

    upsertUserFeatureStore(user);
    const featureRow = db.prepare('SELECT * FROM user_feature_store WHERE user_name = ?').get(currentUser);
    const userHard = safeJsonParse(featureRow ? featureRow.hard_tags : '{}', {});
    const userSoft = safeJsonParse(featureRow ? featureRow.soft_tags : '{}', {});
    const userVector = safeJsonParse(featureRow ? featureRow.feature_vector : '[]', []);

    upsertUserPreferenceProfile(currentUser);
    const userPreferenceProfile = getUserPreferenceProfile(currentUser);
    const userActivitySummary = getUserActivitySummary(currentUser);

    const allCandidates = db.prepare('SELECT * FROM posts WHERE author != ? ORDER BY created_at DESC LIMIT 300').all(currentUser);

    const recalled = allCandidates.filter((post) => {
        const acceptsCrossCampus = Number(post.accept_cross_campus || 0) === 1;
        if (!acceptsCrossCampus && post.campus && userHard.campus && post.campus !== userHard.campus) {
            return false;
        }

        return true;
    });

    const ranked = recalled.map((post) => {
        const normalizedPostCampus = campusValid(post.campus) ? post.campus : '';
        const postTags = safeJsonParse(post.structured_tags || '{}', {});
        const postVector = safeJsonParse(post.feature_vector || '[]', []);
        const postText = `${post.title || ''} ${post.content || ''}`;
        const mbtiHint = getPostMbtiHint(postText);

        const skillScore = overlapScore(userSoft.skills || [], postTags.skills || []);
        const interestScore = overlapScore(userSoft.interests || [], postTags.interests || []);
        const mbtiScore = mbtiCompatibilityScore(userSoft.mbti || '', mbtiHint);
        const semanticScore = cosineSimilarity(userVector, postVector);
        const successRateScore = Number(userSoft.success_rate || 0);
        const behaviorScore = computeBehaviorPreferenceScore(userPreferenceProfile, post);
        const freshnessScore = computeFreshnessScore(post.created_at);
        const activityScore = computeActivityRelevanceScore(userActivitySummary, post);

        const finalScore = (
            skillScore * RECOMMENDATION_WEIGHTS.skill +
            interestScore * RECOMMENDATION_WEIGHTS.interest +
            mbtiScore * RECOMMENDATION_WEIGHTS.mbti +
            semanticScore * RECOMMENDATION_WEIGHTS.semantic +
            successRateScore * RECOMMENDATION_WEIGHTS.success +
            behaviorScore * RECOMMENDATION_WEIGHTS.behavior +
            freshnessScore * RECOMMENDATION_WEIGHTS.freshness +
            activityScore * RECOMMENDATION_WEIGHTS.activity
        );

        const reasons = [];
        if (Number(post.accept_cross_campus || 0) === 1) {
            if (normalizedPostCampus) reasons.push(`跨校区协作已开启（发布校区：${normalizedPostCampus}）`);
            else reasons.push('跨校区协作已开启');
        } else if (normalizedPostCampus) {
            reasons.push(`同校区优先匹配：${normalizedPostCampus}`);
        }
        if (skillScore > 0) reasons.push(`技能匹配度 ${(skillScore * 100).toFixed(0)}%`);
        if (interestScore > 0) reasons.push(`兴趣重合度 ${(interestScore * 100).toFixed(0)}%`);
        if (semanticScore > 0) reasons.push(`语义匹配度 ${(semanticScore * 100).toFixed(0)}%`);
        if (behaviorScore >= 0.55) reasons.push('符合你的历史申请偏好');
        if (activityScore >= 0.5) reasons.push('与你近期活动经历相近');
        if (freshnessScore >= 0.8) reasons.push('发布较新，沟通响应更快');

        return {
            ...post,
            campus: normalizedPostCampus,
            recommendation_score: Number((finalScore * 100).toFixed(1)),
            recommendation_reasons: reasons.slice(0, 3)
        };
    }).sort((a, b) => b.recommendation_score - a.recommendation_score);

    return {
        user,
        ranked,
        recall_count: recalled.length,
        total_candidates: allCandidates.length
    };
}

async function rerankWithAI(user, candidates, limit) {
    if (!AI_RERANK_ENABLED || !aiClient) return null;
    if (!Array.isArray(candidates) || !candidates.length) return [];

    const compactCandidates = candidates.slice(0, 12).map((item) => ({
        id: item.id,
        title: String(item.title || '').slice(0, 42),
        content: String(item.content || '').replace(/\s+/g, ' ').slice(0, 80),
        type: item.type,
        labels: parsePostLabels(item.post_labels),
        campus: item.campus,
        recommendation_score: item.recommendation_score
    }));

    const userProfile = {
        name: user.name,
        department: user.department || '',
        grade: user.grade || '',
        skills: String(user.skills || '').slice(0, 80),
        interests: String(user.interests || '').slice(0, 80),
        bio: String(user.bio || '').slice(0, 120),
        campus: user.campus || ''
    };

    const prompt = [
        '你是校园任务匹配系统的重排器。',
        '请基于用户画像，对候选帖子进行个性化重排。',
        '返回严格 JSON，不要解释，不要 markdown。',
        '理由必须是可执行匹配信息，禁止写“简介中有/标题提到/内容出现/文本包含”等来源描述。',
        'JSON 格式如下：',
        '{"ordered_ids":[1,2,3],"reason_by_id":{"1":["理由1","理由2"]}}',
        'ordered_ids 只包含给定候选 id，且不重复，最多返回 limit 个。',
        'reason_by_id 每个 id 只给 1 条简短中文理由（16字内），优先技能/兴趣/校区/协作方式。',
        `limit=${limit}`,
        `user_profile=${JSON.stringify(userProfile)}`,
        `candidates=${JSON.stringify(compactCandidates)}`
    ].join('\n');

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('AI_RERANK_TIMEOUT')), AI_RERANK_TIMEOUT_MS);
    });

    const completion = await Promise.race([
        aiClient.chat.completions.create({
            model: ZHIPU_MODEL,
            temperature: 0.1,
            max_tokens: 220,
            messages: [
                { role: 'system', content: '你只输出 JSON。' },
                { role: 'user', content: prompt }
            ]
        }),
        timeoutPromise
    ]);

    const content = completion && completion.choices && completion.choices[0] && completion.choices[0].message
        ? completion.choices[0].message.content
        : '';
    const payload = extractJsonPayload(content);
    if (!payload || !Array.isArray(payload.ordered_ids)) return null;

    const reasonById = payload.reason_by_id && typeof payload.reason_by_id === 'object'
        ? payload.reason_by_id
        : {};

    const sourceMap = new Map(candidates.map((item) => [Number(item.id), item]));
    const ordered = [];

    function normalizeReasons(rawReasons, fallbackReasons) {
        const blockedPatterns = [
            /简介中有/i,
            /标题提到/i,
            /内容出现/i,
            /文本包含/i,
            /描述里/i,
            /关键词/i
        ];

        const normalized = (rawReasons || [])
            .map((x) => String(x || '').replace(/[。；;]+$/g, '').trim())
            .filter(Boolean)
            .filter((x) => x.length <= 20)
            .filter((x) => !blockedPatterns.some((re) => re.test(x)));

        if (normalized.length) return [normalized[0]];

        const fallback = (fallbackReasons || [])
            .map((x) => String(x || '').trim())
            .filter(Boolean)
            .filter((x) => !x.includes('语义匹配度'));
        return fallback.length ? [fallback[0]] : [];
    }

    payload.ordered_ids.forEach((rawId) => {
        const id = Number(rawId);
        if (!sourceMap.has(id)) return;
        const baseItem = sourceMap.get(id);
        sourceMap.delete(id);

        const aiReasonsRaw = reasonById[String(id)] || reasonById[id] || [];
        const aiReasons = Array.isArray(aiReasonsRaw)
            ? aiReasonsRaw.map((x) => String(x).trim()).filter(Boolean).slice(0, 2)
            : [String(aiReasonsRaw || '').trim()].filter(Boolean).slice(0, 2);

        const finalReasons = normalizeReasons(aiReasons, baseItem.recommendation_reasons || []);

        ordered.push({
            ...baseItem,
            recommendation_reasons: finalReasons,
            ai_reranked: true
        });
    });

    sourceMap.forEach((item) => {
        ordered.push({ ...item, ai_reranked: false });
    });

    return ordered.slice(0, limit);
}

function campusValid(campus) {
    return ALLOWED_CAMPUSES.includes(campus);
}

function extractMbtiFromText(text) {
    const match = String(text || '').toUpperCase().match(/(INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)/);
    return match ? match[1] : '';
}

function computeUserSuccessRate(userName) {
    const row = db.prepare('SELECT AVG(final_score) AS avg_final FROM reviews WHERE reviewee = ? AND final_score IS NOT NULL').get(userName);
    const avgFinal = row && row.avg_final ? Number(row.avg_final) : 0;
    return Number((avgFinal / 100).toFixed(3));
}

function upsertUserFeatureStore(userRow) {
    if (!userRow || !userRow.name) return;

    const activitySummary = getUserActivitySummary(userRow.name);
    const extraText = [userRow.bio || '', userRow.skills || '', userRow.interests || ''].join(' ');
    const extracted = extractTagsFromText(extraText);
    const skillTags = uniqueList(extracted.skills);
    const interestTags = uniqueList(extracted.interests);
    const mbtiFromText = extractMbtiFromText(userRow.bio || '');
    const successRate = computeUserSuccessRate(userRow.name);

    const hardTags = {
        grade: userRow.grade || '未设置年级',
        major: userRow.department || '未设置院系',
        campus: campusValid(userRow.campus) ? userRow.campus : '沙河校区'
    };

    const softTags = {
        skills: skillTags,
        interests: interestTags,
        mbti: mbtiFromText,
        success_rate: successRate,
        activity_terms: activitySummary.terms || [],
        activity_stats: activitySummary.stats || {}
    };

    const featureText = [
        hardTags.grade,
        hardTags.major,
        hardTags.campus,
        softTags.mbti,
        skillTags.join(' '),
        interestTags.join(' '),
        (activitySummary.terms || []).join(' '),
        userRow.bio || ''
    ].join(' ');

    const featureVector = buildHashedVector(featureText);

    db.prepare(`
        INSERT INTO user_feature_store (user_name, hard_tags, soft_tags, feature_vector, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_name)
        DO UPDATE SET
            hard_tags = excluded.hard_tags,
            soft_tags = excluded.soft_tags,
            feature_vector = excluded.feature_vector,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        userRow.name,
        JSON.stringify(hardTags),
        JSON.stringify(softTags),
        JSON.stringify(featureVector)
    );
}

function buildPostFeatures(postInput) {
    const text = [postInput.title || '', postInput.content || ''].join(' ');
    const labels = parsePostLabels(postInput.labels);
    const extracted = extractTagsFromText(text);
    const structuredTags = {
        skills: extracted.skills,
        interests: extracted.interests,
        labels,
        campus: postInput.campus || '',
        accept_cross_campus: postInput.accept_cross_campus ? 1 : 0
    };
    const featureVector = buildHashedVector([
        text,
        labels.join(' '),
        structuredTags.skills.join(' '),
        structuredTags.interests.join(' '),
        structuredTags.campus,
        String(structuredTags.accept_cross_campus)
    ].join(' '));

    return { structuredTags, featureVector };
}

function overlapScore(listA, listB) {
    const setA = new Set((listA || []).map((x) => String(x).toLowerCase()));
    const setB = new Set((listB || []).map((x) => String(x).toLowerCase()));
    if (!setA.size || !setB.size) return 0;
    let hits = 0;
    setA.forEach((item) => {
        if (setB.has(item)) hits += 1;
    });
    return hits / Math.max(setA.size, setB.size);
}

function computePostSearchScore(post, queryText) {
    const query = String(queryText || '').trim();
    if (!query) return 0;
    const queryLower = query.toLowerCase();
    const queryTokens = tokenizeText(queryLower).filter((token) => token.length >= 2);
    const queryTags = extractTagsFromText(query);
    const queryVec = buildHashedVector(query);

    const labels = parsePostLabels(post.post_labels);
    const structured = safeJsonParse(post.structured_tags || '{}', {});
    const postText = `${post.title || ''} ${post.content || ''} ${labels.join(' ')} ${(structured.skills || []).join(' ')} ${(structured.interests || []).join(' ')}`;
    const postLower = postText.toLowerCase();
    const postVec = safeJsonParse(post.feature_vector || '[]', []);
    const fallbackVec = Array.isArray(postVec) && postVec.length ? postVec : buildHashedVector(postText);

    const semanticScore = cosineSimilarity(queryVec, fallbackVec);
    const exactScore = postLower.includes(queryLower) ? 1 : 0;
    const tokenHit = queryTokens.length
        ? queryTokens.filter((token) => postLower.includes(token)).length / queryTokens.length
        : 0;
    const skillOverlap = overlapScore(queryTags.skills || [], structured.skills || []);
    const interestOverlap = overlapScore(queryTags.interests || [], structured.interests || []);
    const tagOverlap = (skillOverlap + interestOverlap) / 2;

    return Number((
        semanticScore * 0.45 +
        exactScore * 0.25 +
        tokenHit * 0.2 +
        tagOverlap * 0.1
    ).toFixed(6));
}

function mbtiCompatibilityScore(userMbti, postHintMbti) {
    const a = String(userMbti || '').toUpperCase();
    const b = String(postHintMbti || '').toUpperCase();
    if (!a || !b || a.length < 4 || b.length < 4) return 0.5;
    if (a === b) return 1;
    let same = 0;
    for (let i = 0; i < 4; i += 1) {
        if (a[i] === b[i]) same += 1;
    }
    return same / 4;
}

function getPostMbtiHint(postText) {
    const match = String(postText || '').toUpperCase().match(/(INTJ|INTP|ENTJ|ENTP|INFJ|INFP|ENFJ|ENFP|ISTJ|ISFJ|ESTJ|ESFJ|ISTP|ISFP|ESTP|ESFP)/);
    return match ? match[1] : '';
}

// 3. 编写【注册接口】
app.post('/api/register', (req, res) => {
    const { name, email, password } = req.body;
    
    try {
        // 准备 SQL 语句
        const stmt = db.prepare("INSERT INTO users (name, email, password, campus) VALUES (?, ?, ?, '')");
        // 执行插入
        stmt.run(name, email, password);
        const newUser = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
        upsertUserFeatureStore(newUser);
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
    const {
        author,
        title,
        content,
        type,
        labels,
        custom_label,
        location,
        compensation,
        accept_cross_campus,
        off_campus_location,
        requires_management
    } = req.body;

    const authorRow = db.prepare('SELECT campus FROM users WHERE name = ?').get(author);
    const normalizedCampus = (authorRow && campusValid(authorRow.campus)) ? authorRow.campus : '';
    const normalizedCrossCampus = accept_cross_campus ? 1 : 0;
    const normalizedOffCampusLocation = String(off_campus_location || '').trim();
    const normalizedLabels = parsePostLabels(labels);
    const presetLabels = new Set(['寻人组队', '提供技能', '自定义']);
    const selectedLabel = String(normalizedLabels[0] || '').trim();
    const customLabelText = String(custom_label || '').trim();
    let finalLabel = selectedLabel;
    if (!selectedLabel) return res.status(400).json({ success: false, message: '请选择一个标签' });
    if (!presetLabels.has(selectedLabel)) {
        return res.status(400).json({ success: false, message: '标签仅支持：寻人组队 / 提供技能 / 自定义' });
    }
    if (selectedLabel === '自定义') {
        if (!customLabelText) return res.status(400).json({ success: false, message: '请选择自定义标签时必须填写标签内容' });
        if (customLabelText.length > 12) return res.status(400).json({ success: false, message: '自定义标签最多 12 个字符' });
        finalLabel = customLabelText;
    }
    const normalizedLabelList = finalLabel ? [finalLabel] : [];
    const normalizedRequiresManagement = !!requires_management ? 1 : 0;
    const normalizedType = normalizePostType(type, normalizedLabelList, normalizedRequiresManagement === 1);

    const { structuredTags, featureVector } = buildPostFeatures({
        title,
        content,
        labels: normalizedLabelList,
        campus: normalizedCampus,
        accept_cross_campus: normalizedCrossCampus
    });

    console.log('📝 收到发布请求:', { author, title, type: normalizedType, labels: normalizedLabelList, campus: normalizedCampus, accept_cross_campus: normalizedCrossCampus });
    try {
        const stmt = db.prepare(`
            INSERT INTO posts (
                author, title, content, type, post_labels, location, compensation,
                collaboration_mode, campus, expected_hours, structured_tags, feature_vector, off_campus_location, accept_cross_campus, requires_management
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = stmt.run(
            author,
            title,
            content,
            normalizedType,
            JSON.stringify(normalizedLabelList),
            location || '',
            compensation || '',
            'offline',
            normalizedCampus,
            0,
            JSON.stringify(structuredTags),
            JSON.stringify(featureVector),
            normalizedOffCampusLocation,
            normalizedCrossCampus,
            normalizedRequiresManagement
        );

        if (normalizedType === '寻人组队' && normalizedRequiresManagement === 1) {
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
        posts.forEach((post) => {
            post.post_labels = parsePostLabels(post.post_labels);
        });
        
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

            if (post.type === '寻人组队' && Number(post.requires_management || 0) === 1) {
                const project = ensureProjectForRecruitingPost(post);
                post.project_status = project ? project.status : 'recruiting';
            }
        });
        
        res.json({ success: true, data: posts });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取帖子失败' });
    }
});

app.get('/api/posts/search-ai', (req, res) => {
    const query = String(req.query.q || '').trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 80)));

    if (!query) {
        return res.json({ success: true, ai_assisted: true, data: [] });
    }

    try {
        const posts = db.prepare('SELECT id, title, content, post_labels, structured_tags, feature_vector, created_at FROM posts').all();
        const ranked = posts
            .map((post) => ({
                id: post.id,
                score: computePostSearchScore(post, query),
                created_at: post.created_at
            }))
            .filter((item) => item.score >= 0.08)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                return new Date(b.created_at || 0) - new Date(a.created_at || 0);
            })
            .slice(0, limit)
            .map((item) => ({ id: item.id, score: item.score }));

        res.json({ success: true, ai_assisted: true, data: ranked });
    } catch (err) {
        res.status(500).json({ success: false, message: '智能检索失败' });
    }
});

// 🌟 智能推荐 MVP：先召回剪枝，再排序打分
app.get('/api/recommendations', (req, res) => {
    const currentUser = req.query.user;
    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 8)));

    if (!currentUser) {
        return res.status(400).json({ success: false, message: '缺少 user 参数' });
    }

    try {
        const context = buildRecommendationContext(currentUser);
        res.json({
            success: true,
            data: context.ranked.slice(0, limit),
            recall_count: context.recall_count,
            total_candidates: context.total_candidates,
            weights: RECOMMENDATION_WEIGHTS,
            ai_rerank_enabled: AI_RERANK_ENABLED,
            ai_used: false
        });
    } catch (err) {
        const status = Number(err && err.statusCode) || 500;
        const message = status === 404 ? '用户不存在' : '推荐计算失败';
        res.status(status).json({ success: false, message });
    }
});

// AI 重排版推荐：先走现有规则召回排序，再交给 GLM 二次重排；失败时自动回退
app.get('/api/recommendations-ai', async (req, res) => {
    const currentUser = req.query.user;
    const limit = Math.min(30, Math.max(1, Number(req.query.limit || 8)));

    if (!currentUser) {
        return res.status(400).json({ success: false, message: '缺少 user 参数' });
    }

    try {
        const context = buildRecommendationContext(currentUser);
        const baseline = context.ranked.slice(0, limit);
        const cacheKey = `${currentUser}:${limit}`;
        const cached = aiRerankCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < AI_RERANK_CACHE_TTL_MS) {
            return res.json({
                success: true,
                data: cached.data,
                recall_count: context.recall_count,
                total_candidates: context.total_candidates,
                weights: RECOMMENDATION_WEIGHTS,
                ai_rerank_enabled: true,
                ai_used: true,
                cache_hit: true,
                fallback: false,
                model: ZHIPU_MODEL
            });
        }

        if (!AI_RERANK_ENABLED) {
            return res.json({
                success: true,
                data: baseline,
                recall_count: context.recall_count,
                total_candidates: context.total_candidates,
                weights: RECOMMENDATION_WEIGHTS,
                ai_rerank_enabled: false,
                ai_used: false,
                fallback: true,
                message: '未检测到 ZHIPU_API_KEY，已自动回退基础推荐。'
            });
        }

        const candidatesForAI = context.ranked.slice(0, 12);
        let reranked = null;
        try {
            reranked = await rerankWithAI(context.user, candidatesForAI, limit);
        } catch (aiErr) {
            reranked = null;
        }

        if (!reranked || !reranked.length) {
            return res.json({
                success: true,
                data: baseline,
                recall_count: context.recall_count,
                total_candidates: context.total_candidates,
                weights: RECOMMENDATION_WEIGHTS,
                ai_rerank_enabled: true,
                ai_used: false,
                fallback: true,
                message: 'AI 重排暂时不可用，已自动回退基础推荐。'
            });
        }

        aiRerankCache.set(cacheKey, { ts: Date.now(), data: reranked });

        return res.json({
            success: true,
            data: reranked,
            recall_count: context.recall_count,
            total_candidates: context.total_candidates,
            weights: RECOMMENDATION_WEIGHTS,
            ai_rerank_enabled: true,
            ai_used: true,
            cache_hit: false,
            fallback: false,
            model: ZHIPU_MODEL
        });
    } catch (err) {
        const status = Number(err && err.statusCode) || 500;
        const message = status === 404 ? '用户不存在' : 'AI 推荐计算失败';
        return res.status(status).json({ success: false, message });
    }
});

// 推荐配置读取接口：便于前端展示当前权重
app.get('/api/recommendation-config', (req, res) => {
    res.json({
        success: true,
        campus_options: ALLOWED_CAMPUSES,
        cross_campus_option: 'accept_cross_campus',
        weights: RECOMMENDATION_WEIGHTS
    });
});

// 校外地址占位接口：当前先保留空实现，后续可接入外部地图 API
app.post('/api/location/off-campus/resolve', (req, res) => {
    const { address_text } = req.body || {};
    if (!String(address_text || '').trim()) {
        return res.status(400).json({ success: false, message: 'address_text 不能为空' });
    }

    return res.status(501).json({
        success: false,
        message: '校外定位接口尚未接入，当前仅支持沙河校区/西土城校区的线下匹配。',
        placeholder: {
            raw_address: String(address_text).trim(),
            lng: null,
            lat: null,
            provider: null
        }
    });
});

// 🌟 【新增：提交报名/申请接口】
app.post('/api/apply', (req, res) => {
    const { post_id, applicant_name, message } = req.body;
    try {
        const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(post_id);
        if (!post) return res.status(404).json({ success: false, message: '帖子不存在' });
        if (post.author === applicant_name) return res.status(400).json({ success: false, message: '不能报名自己的帖子' });

        if (post.type === '寻人组队' && Number(post.requires_management || 0) === 1) {
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
        recordRecommendationEvent(applicant_name, post_id, 'apply', 1);
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
        const user = db.prepare(`
            SELECT name, email, department, grade, bio, portfolio, campus
            FROM users
            WHERE name = ?
        `).get(username);
        if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

        upsertUserFeatureStore(user);
        const featureRow = db.prepare('SELECT hard_tags, soft_tags, feature_vector, updated_at FROM user_feature_store WHERE user_name = ?').get(username);
        const featureStore = featureRow
            ? {
                hard_tags: safeJsonParse(featureRow.hard_tags, {}),
                soft_tags: safeJsonParse(featureRow.soft_tags, {}),
                feature_vector: safeJsonParse(featureRow.feature_vector, []),
                updated_at: featureRow.updated_at
            }
            : null;

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

        const activities = getUserActivitySummary(username);

        res.json({
            success: true,
            data: user,
            reviews: reviews,
            avgFinalScore,
            avgStar,
            featureStore,
            activities
        });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 2. 更新个人资料
app.put('/api/profile', (req, res) => {
    const { name, department, grade, bio, portfolio, campus } = req.body;
    const normalizedCampus = campusValid(campus) ? campus : '';
    try {
        db.prepare(`
            UPDATE users
            SET department = ?, grade = ?, bio = ?, portfolio = ?, campus = ?
            WHERE name = ?
        `).run(
            department,
            grade,
            bio,
            portfolio,
            normalizedCampus,
            name
        );

        const updatedUser = db.prepare('SELECT * FROM users WHERE name = ?').get(name);
        upsertUserFeatureStore(updatedUser);
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

        if (post.type === '寻人组队' && Number(post.requires_management || 0) === 1) {
            const project = ensureProjectForRecruitingPost(post);
            if (project.status !== 'recruiting') {
                return res.status(400).json({ success: false, message: '当前项目非招募阶段，不能继续审批' });
            }
            if (decision === 'accepted') {
                const before = db.prepare('SELECT role FROM team_members WHERE project_id = ? AND user_name = ?').get(project.id, appRow.applicant_name);
                db.prepare('INSERT OR IGNORE INTO team_members (project_id, user_name, role) VALUES (?, ?, ?)')
                    .run(project.id, appRow.applicant_name, 'member');
                if (!before) {
                    logProjectMemberHistory(project.id, owner, appRow.applicant_name, 'join', '', 'member', '招募审批通过入队');
                    logProjectEvent(project.id, owner, 'member', '成员加入项目', `${appRow.applicant_name} 通过申请加入项目`, 'low');
                }
            }
        }

        db.prepare('UPDATE applications SET status = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(decision, applicationId);

        if (decision === 'accepted') {
            recordRecommendationEvent(appRow.applicant_name, appRow.post_id, 'accepted', 1);
        }

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
              AND COALESCE(p.requires_management, 0) = 1
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
                        JOIN posts p ON p.id = tp.post_id
            JOIN team_members tm ON tm.project_id = tp.id
            WHERE tm.user_name = ?
                            AND COALESCE(p.requires_management, 0) = 1
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
                can_manage: isProjectLeader(project.id, currentUser)
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

        const members = db.prepare(`
            SELECT user_name, role, joined_at
            FROM team_members
            WHERE project_id = ?
            ORDER BY CASE role WHEN 'leader' THEN 1 WHEN 'core_member' THEN 2 ELSE 3 END, joined_at ASC
        `).all(projectId);
        const milestones = db.prepare('SELECT * FROM milestones WHERE project_id = ? ORDER BY created_at ASC').all(projectId);
        const checkins = db.prepare('SELECT * FROM checkins WHERE project_id = ? ORDER BY created_at DESC LIMIT 50').all(projectId);
        const requirements = db.prepare('SELECT * FROM project_requirements WHERE project_id = ? ORDER BY created_at DESC, id DESC').all(projectId);
        const memberChanges = db.prepare('SELECT * FROM project_member_history WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 40').all(projectId);
        const requirementChanges = db.prepare('SELECT * FROM project_requirement_history WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 60').all(projectId);
        const scoreboard = buildProjectScoreboard(projectId);

        res.json({
            success: true,
            data: {
                project,
                members,
                milestones,
                checkins,
                requirements,
                member_changes: memberChanges,
                requirement_changes: requirementChanges,
                scoreboard,
                can_manage: isProjectLeader(projectId, currentUser),
                is_member: true
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取项目详情失败' });
    }
});

// 6.5 项目需求列表
app.get('/api/projects/:id/requirements', (req, res) => {
    const projectId = req.params.id;
    const currentUser = req.query.user;

    if (!isProjectMember(projectId, currentUser)) {
        return res.status(403).json({ success: false, message: '仅项目成员可查看需求' });
    }

    try {
        const rows = db.prepare('SELECT * FROM project_requirements WHERE project_id = ? ORDER BY created_at DESC, id DESC').all(projectId);
        res.json({ success: true, data: rows, can_manage: isProjectLeader(projectId, currentUser) });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取项目需求失败' });
    }
});

// 6.6 新增项目需求
app.post('/api/projects/:id/requirements', (req, res) => {
    const projectId = req.params.id;
    const { actor, title, description, priority, assignee } = req.body;
    const normalizedTitle = String(title || '').trim();
    const normalizedDesc = String(description || '').trim();
    const normalizedPriority = ['low', 'medium', 'high'].includes(priority) ? priority : 'medium';
    const normalizedAssignee = String(assignee || '').trim();

    if (!normalizedTitle) return res.status(400).json({ success: false, message: '需求标题不能为空' });
    if (!isProjectMember(projectId, actor)) return res.status(403).json({ success: false, message: '仅项目成员可发布需求' });
    if (normalizedAssignee && !isProjectMember(projectId, normalizedAssignee)) {
        return res.status(400).json({ success: false, message: '被指派成员不在项目内' });
    }

    try {
        const result = db.prepare(`
            INSERT INTO project_requirements (project_id, title, description, status, priority, assignee, created_by)
            VALUES (?, ?, ?, 'open', ?, ?, ?)
        `).run(projectId, normalizedTitle, normalizedDesc, normalizedPriority, normalizedAssignee, actor);
        const requirement = db.prepare('SELECT * FROM project_requirements WHERE id = ?').get(result.lastInsertRowid);
        logRequirementHistory(projectId, requirement.id, actor, 'create', {}, requirement);
        logProjectEvent(projectId, actor, 'requirement', '新增项目需求', `${normalizedTitle}${normalizedAssignee ? `（指派 ${normalizedAssignee}）` : ''}`, 'low');
        res.json({ success: true, message: '项目需求已发布', data: requirement });
    } catch (err) {
        res.status(500).json({ success: false, message: '发布项目需求失败' });
    }
});

// 6.7 更新项目需求（状态流转、改派、编辑）
app.put('/api/projects/:id/requirements/:rid', (req, res) => {
    const projectId = req.params.id;
    const requirementId = req.params.rid;
    const { actor, status, priority, assignee, title, description } = req.body;
    const targetStatus = status ? String(status).trim() : '';
    const targetPriority = priority ? String(priority).trim() : '';
    const targetAssignee = assignee === undefined ? undefined : String(assignee || '').trim();
    const targetTitle = title === undefined ? undefined : String(title || '').trim();
    const targetDescription = description === undefined ? undefined : String(description || '').trim();
    const allowedStatus = ['open', 'in_progress', 'blocked', 'done'];
    const allowedPriority = ['low', 'medium', 'high'];

    if (!isProjectMember(projectId, actor)) return res.status(403).json({ success: false, message: '仅项目成员可更新需求' });

    try {
        const current = db.prepare('SELECT * FROM project_requirements WHERE id = ? AND project_id = ?').get(requirementId, projectId);
        if (!current) return res.status(404).json({ success: false, message: '项目需求不存在' });

        const canManage = isProjectLeader(projectId, actor);
        const canUpdateStatus = canManage || current.assignee === actor || current.created_by === actor;
        if (!canUpdateStatus) return res.status(403).json({ success: false, message: '你无权更新该需求' });

        let nextStatus = current.status;
        let nextPriority = current.priority || 'medium';
        let nextAssignee = current.assignee || '';
        let nextTitle = current.title;
        let nextDescription = current.description || '';

        if (targetStatus) {
            if (!allowedStatus.includes(targetStatus)) return res.status(400).json({ success: false, message: '需求状态不合法' });
            nextStatus = targetStatus;
        }
        if (targetPriority) {
            if (!allowedPriority.includes(targetPriority)) return res.status(400).json({ success: false, message: '需求优先级不合法' });
            nextPriority = targetPriority;
        }

        if (targetAssignee !== undefined) {
            if (!canManage) return res.status(403).json({ success: false, message: '仅队长可改派需求' });
            if (targetAssignee && !isProjectMember(projectId, targetAssignee)) {
                return res.status(400).json({ success: false, message: '新指派成员不在项目内' });
            }
            nextAssignee = targetAssignee;
        }
        if (targetTitle !== undefined) {
            if (!canManage) return res.status(403).json({ success: false, message: '仅队长可编辑需求标题' });
            if (!targetTitle) return res.status(400).json({ success: false, message: '需求标题不能为空' });
            nextTitle = targetTitle;
        }
        if (targetDescription !== undefined) {
            if (!canManage) return res.status(403).json({ success: false, message: '仅队长可编辑需求说明' });
            nextDescription = targetDescription;
        }

        db.prepare(`
            UPDATE project_requirements
            SET title = ?, description = ?, status = ?, priority = ?, assignee = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND project_id = ?
        `).run(nextTitle, nextDescription, nextStatus, nextPriority, nextAssignee, requirementId, projectId);

        const updated = db.prepare('SELECT * FROM project_requirements WHERE id = ?').get(requirementId);
        logRequirementHistory(projectId, Number(requirementId), actor, 'update', current, updated);
        logProjectEvent(
            projectId,
            actor,
            'requirement',
            '更新项目需求',
            `${updated.title} | ${current.status} -> ${updated.status}${current.assignee !== updated.assignee ? ` | 改派 ${current.assignee || '未分配'} -> ${updated.assignee || '未分配'}` : ''}`,
            updated.status === 'blocked' ? 'high' : 'low'
        );

        res.json({ success: true, message: '项目需求已更新', data: updated });
    } catch (err) {
        res.status(500).json({ success: false, message: '更新项目需求失败' });
    }
});

// 6.8 成员调整：新增成员
app.get('/api/projects/:id/members', (req, res) => {
    const projectId = req.params.id;
    const currentUser = req.query.user;
    if (!isProjectMember(projectId, currentUser)) {
        return res.status(403).json({ success: false, message: '仅项目成员可查看成员信息' });
    }

    try {
        const members = db.prepare(`
            SELECT user_name, role, joined_at
            FROM team_members
            WHERE project_id = ?
            ORDER BY CASE role WHEN 'leader' THEN 1 WHEN 'core_member' THEN 2 ELSE 3 END, joined_at ASC
        `).all(projectId);
        const history = db.prepare('SELECT * FROM project_member_history WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT 80').all(projectId);
        res.json({ success: true, data: members, history, can_manage: isProjectLeader(projectId, currentUser) });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取成员信息失败' });
    }
});

// 6.8 成员调整：新增成员
app.post('/api/projects/:id/members', (req, res) => {
    const projectId = req.params.id;
    const { actor, user_name, role } = req.body;
    const targetUser = String(user_name || '').trim();
    const targetRole = normalizeProjectRole(role);
    if (!targetUser) return res.status(400).json({ success: false, message: '目标成员不能为空' });
    if (!isProjectLeader(projectId, actor)) return res.status(403).json({ success: false, message: '仅队长可新增成员' });

    try {
        const existed = db.prepare('SELECT role FROM team_members WHERE project_id = ? AND user_name = ?').get(projectId, targetUser);
        if (existed) return res.status(400).json({ success: false, message: '该成员已在项目中' });

        db.prepare('INSERT INTO team_members (project_id, user_name, role) VALUES (?, ?, ?)').run(projectId, targetUser, targetRole);
        if (targetRole === 'leader') {
            db.prepare("UPDATE team_members SET role = 'core_member' WHERE project_id = ? AND user_name != ? AND role = 'leader'").run(projectId, targetUser);
            db.prepare('UPDATE team_projects SET owner = ? WHERE id = ?').run(targetUser, projectId);
        }

        logProjectMemberHistory(projectId, actor, targetUser, 'join', '', targetRole, '中途新增成员');
        logProjectEvent(projectId, actor, 'member', '新增项目成员', `${targetUser} 加入项目（${targetRole}）`, 'medium');
        res.json({ success: true, message: '成员已加入项目' });
    } catch (err) {
        res.status(500).json({ success: false, message: '新增成员失败' });
    }
});

// 6.9 成员调整：角色变更
app.put('/api/projects/:id/members/:memberName', (req, res) => {
    const projectId = req.params.id;
    const targetUser = decodeURIComponent(req.params.memberName || '');
    const { actor, role } = req.body;
    const targetRole = normalizeProjectRole(role);
    if (!targetUser) return res.status(400).json({ success: false, message: '目标成员不能为空' });
    if (!isProjectLeader(projectId, actor)) return res.status(403).json({ success: false, message: '仅队长可调整成员角色' });

    try {
        const member = db.prepare('SELECT * FROM team_members WHERE project_id = ? AND user_name = ?').get(projectId, targetUser);
        if (!member) return res.status(404).json({ success: false, message: '成员不在项目内' });
        if (member.role === targetRole) return res.json({ success: true, message: '角色未发生变化' });
        const project = db.prepare('SELECT owner FROM team_projects WHERE id = ?').get(projectId);
        if (member.role === 'leader' && targetRole !== 'leader' && project && project.owner === targetUser) {
            return res.status(400).json({ success: false, message: '请先将其他成员设为队长，再调整当前队长角色' });
        }

        if (targetRole === 'leader') {
            db.prepare("UPDATE team_members SET role = 'core_member' WHERE project_id = ? AND role = 'leader' AND user_name != ?").run(projectId, targetUser);
            db.prepare('UPDATE team_projects SET owner = ? WHERE id = ?').run(targetUser, projectId);
        }
        db.prepare('UPDATE team_members SET role = ? WHERE project_id = ? AND user_name = ?').run(targetRole, projectId, targetUser);

        logProjectMemberHistory(projectId, actor, targetUser, 'role_change', member.role || '', targetRole, '项目角色调整');
        logProjectEvent(projectId, actor, 'member', '成员角色调整', `${targetUser}: ${member.role || 'member'} -> ${targetRole}`, 'medium');
        res.json({ success: true, message: '成员角色已更新' });
    } catch (err) {
        res.status(500).json({ success: false, message: '角色更新失败' });
    }
});

// 6.10 成员调整：成员退出/移除
app.delete('/api/projects/:id/members/:memberName', (req, res) => {
    const projectId = req.params.id;
    const targetUser = decodeURIComponent(req.params.memberName || '');
    const { actor, reassign_to } = req.body;
    const reassignTo = String(reassign_to || '').trim();
    if (!targetUser) return res.status(400).json({ success: false, message: '目标成员不能为空' });

    try {
        const member = db.prepare('SELECT * FROM team_members WHERE project_id = ? AND user_name = ?').get(projectId, targetUser);
        if (!member) return res.status(404).json({ success: false, message: '成员不在项目内' });

        const selfExit = actor === targetUser;
        if (!selfExit && !isProjectLeader(projectId, actor)) {
            return res.status(403).json({ success: false, message: '仅队长可移除成员' });
        }
        if (selfExit && member.role === 'leader') {
            return res.status(400).json({ success: false, message: '队长不能直接退出，请先转移队长角色' });
        }
        if (!selfExit && member.role === 'leader') {
            return res.status(400).json({ success: false, message: '请先调整队长角色后再移除' });
        }

        if (reassignTo && !isProjectMember(projectId, reassignTo)) {
            return res.status(400).json({ success: false, message: '改派目标不在项目内' });
        }

        const assignmentCountRow = db.prepare('SELECT COUNT(*) AS count FROM project_requirements WHERE project_id = ? AND assignee = ? AND status != ?').get(projectId, targetUser, 'done');
        const assignmentCount = assignmentCountRow ? assignmentCountRow.count || 0 : 0;
        if (assignmentCount > 0 && !reassignTo) {
            db.prepare('UPDATE project_requirements SET assignee = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND assignee = ? AND status != ?')
                .run('', projectId, targetUser, 'done');
        } else if (assignmentCount > 0 && reassignTo) {
            db.prepare('UPDATE project_requirements SET assignee = ?, updated_at = CURRENT_TIMESTAMP WHERE project_id = ? AND assignee = ? AND status != ?')
                .run(reassignTo, projectId, targetUser, 'done');
            logProjectEvent(projectId, actor, 'requirement', '需求批量改派', `${targetUser} 的 ${assignmentCount} 条需求改派给 ${reassignTo}`, 'medium');
        }

        db.prepare('DELETE FROM team_members WHERE project_id = ? AND user_name = ?').run(projectId, targetUser);
        logProjectMemberHistory(projectId, actor, targetUser, selfExit ? 'leave' : 'remove', member.role || '', '', reassignTo ? `需求改派到 ${reassignTo}` : '需求取消指派');
        logProjectEvent(projectId, actor, 'member', selfExit ? '成员退出项目' : '成员被移出项目', `${targetUser} 已离开项目`, 'medium');
        res.json({ success: true, message: selfExit ? '你已退出项目' : '成员已移出项目' });
    } catch (err) {
        res.status(500).json({ success: false, message: '移除成员失败' });
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
        if (!isProjectLeader(projectId, actor)) return res.status(403).json({ success: false, message: '仅队长可修改项目状态' });

        if (status === 'executing' && !project.started_at) {
            db.prepare('UPDATE team_projects SET status = ?, started_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, projectId);
        } else if (status === 'completed') {
            db.prepare('UPDATE team_projects SET status = ?, ended_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, projectId);
            const projectMembers = db.prepare('SELECT user_name FROM team_members WHERE project_id = ?').all(projectId);
            projectMembers.forEach((member) => {
                recordRecommendationEvent(member.user_name, project.post_id, 'complete', 1);
            });
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
        if (!isProjectLeader(projectId, actor)) return res.status(403).json({ success: false, message: '仅队长可新增里程碑' });
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
        if (!isProjectLeader(projectId, actor)) return res.status(403).json({ success: false, message: '仅队长可更新里程碑状态' });
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

        const canDelete = isProjectLeader(projectId, actor) || checkin.user_name === actor;
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
        res.json({ success: true, data: rows, can_manage: isProjectLeader(projectId, currentUser) });
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
    if (!isProjectLeader(projectId, actor)) return res.status(403).json({ success: false, message: '仅发布者/队长可处理反馈' });

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

        const canDelete = row.author === actor || isProjectLeader(projectId, actor);
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
                can_manage: isProjectLeader(projectId, currentUser)
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

function resolveCircleProposal(proposalId) {
    const proposal = db.prepare('SELECT * FROM circle_proposals WHERE id = ?').get(proposalId);
    if (!proposal) return null;
    if (proposal.status !== 'pending') return proposal;

    const now = Date.now();
    const deadline = Date.parse(String(proposal.public_until || ''));
    if (!Number.isNaN(deadline) && now > deadline) {
        db.prepare("UPDATE circle_proposals SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(proposalId);
        return db.prepare('SELECT * FROM circle_proposals WHERE id = ?').get(proposalId);
    }

    const supportCount = db.prepare('SELECT COUNT(*) AS count FROM circle_proposal_supports WHERE proposal_id = ?').get(proposalId).count || 0;
    if (supportCount < CIRCLE_PROPOSAL_SUPPORT_THRESHOLD) return proposal;

    const exists = db.prepare('SELECT id FROM community_circles WHERE name = ?').get(proposal.name);
    if (exists) {
        db.prepare("UPDATE circle_proposals SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .run(proposalId);
        return db.prepare('SELECT * FROM circle_proposals WHERE id = ?').get(proposalId);
    }

    const insert = db.prepare('INSERT INTO community_circles (name, description, creator) VALUES (?, ?, ?)')
        .run(proposal.name, proposal.description, proposal.proposer);
    const circleId = insert.lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO circle_members (circle_id, user_name, role) VALUES (?, ?, ?)')
        .run(circleId, proposal.proposer, 'owner');

    db.prepare("UPDATE circle_proposals SET status = 'approved', approved_circle_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(circleId, proposalId);

    return db.prepare('SELECT * FROM circle_proposals WHERE id = ?').get(proposalId);
}

app.post('/api/circles', (req, res) => {
    const { creator, name, description } = req.body;
    const circleName = String(name || '').trim();
    const circleDescription = String(description || '').trim();

    if (!creator || !circleName || !circleDescription) {
        return res.status(400).json({ success: false, message: 'creator、name、description 都不能为空' });
    }

    try {
        const exists = db.prepare('SELECT id FROM community_circles WHERE name = ?').get(circleName);
        if (exists) {
            return res.status(400).json({ success: false, message: '该圈子已存在' });
        }

        const pending = db.prepare("SELECT id FROM circle_proposals WHERE name = ? AND status = 'pending'").get(circleName);
        if (pending) {
            return res.status(400).json({ success: false, message: '该圈子正在公示中' });
        }

        const publicUntil = new Date(Date.now() + CIRCLE_PROPOSAL_PUBLIC_DAYS * 24 * 60 * 60 * 1000).toISOString();
        const insertResult = db.prepare(`
            INSERT INTO circle_proposals (name, description, proposer, status, public_until)
            VALUES (?, ?, ?, 'pending', ?)
        `).run(circleName, circleDescription, creator, publicUntil);
        const proposalId = insertResult.lastInsertRowid;

        db.prepare('INSERT OR IGNORE INTO circle_proposal_supports (proposal_id, user_name) VALUES (?, ?)')
            .run(proposalId, creator);

        const supportCount = db.prepare('SELECT COUNT(*) AS count FROM circle_proposal_supports WHERE proposal_id = ?').get(proposalId).count || 0;

        res.json({
            success: true,
            message: `已进入公示，当前支持 ${supportCount}/${CIRCLE_PROPOSAL_SUPPORT_THRESHOLD}`,
            data: {
                proposal_id: proposalId,
                support_count: supportCount,
                threshold: CIRCLE_PROPOSAL_SUPPORT_THRESHOLD,
                public_until: publicUntil
            }
        });
    } catch (err) {
        res.status(400).json({ success: false, message: '圈子公示创建失败' });
    }
});

app.get('/api/circle-proposals', (req, res) => {
    const currentUser = req.query.user;
    const limit = Math.min(120, Math.max(1, Number(req.query.limit || 40)));

    try {
        const rows = db.prepare(`
            SELECT p.*,
                   (SELECT COUNT(*) FROM circle_proposal_supports s WHERE s.proposal_id = p.id) AS support_count
            FROM circle_proposals p
            ORDER BY p.created_at DESC
            LIMIT ?
        `).all(limit);

        const supportedSet = new Set();
        if (currentUser) {
            const supported = db.prepare('SELECT proposal_id FROM circle_proposal_supports WHERE user_name = ?').all(currentUser);
            supported.forEach((row) => supportedSet.add(Number(row.proposal_id)));
        }

        const data = rows.map((row) => {
            const resolved = resolveCircleProposal(row.id) || row;
            return {
                ...resolved,
                support_count: row.support_count,
                threshold: CIRCLE_PROPOSAL_SUPPORT_THRESHOLD,
                supported_by_me: supportedSet.has(Number(row.id))
            };
        });

        res.json({ success: true, data, threshold: CIRCLE_PROPOSAL_SUPPORT_THRESHOLD, public_days: CIRCLE_PROPOSAL_PUBLIC_DAYS });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取圈子公示失败' });
    }
});

app.post('/api/circle-proposals/:id/support', (req, res) => {
    const proposalId = Number(req.params.id);
    const { user } = req.body;
    if (!user || !proposalId) return res.status(400).json({ success: false, message: '缺少必要参数' });

    try {
        const proposal = db.prepare('SELECT * FROM circle_proposals WHERE id = ?').get(proposalId);
        if (!proposal) return res.status(404).json({ success: false, message: '提案不存在' });

        const resolved = resolveCircleProposal(proposalId);
        if (!resolved || resolved.status !== 'pending') {
            return res.status(400).json({ success: false, message: '该提案已结束公示' });
        }

        db.prepare('INSERT OR IGNORE INTO circle_proposal_supports (proposal_id, user_name) VALUES (?, ?)')
            .run(proposalId, user);

        const afterResolve = resolveCircleProposal(proposalId);
        const supportCount = db.prepare('SELECT COUNT(*) AS count FROM circle_proposal_supports WHERE proposal_id = ?').get(proposalId).count || 0;
        const approved = afterResolve && afterResolve.status === 'approved';

        res.json({
            success: true,
            message: approved ? '支持已达阈值，圈子已正式开通' : `已支持，当前 ${supportCount}/${CIRCLE_PROPOSAL_SUPPORT_THRESHOLD}`,
            data: {
                proposal_id: proposalId,
                support_count: supportCount,
                threshold: CIRCLE_PROPOSAL_SUPPORT_THRESHOLD,
                status: afterResolve ? afterResolve.status : 'pending',
                approved_circle_id: afterResolve ? afterResolve.approved_circle_id : null
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: '支持操作失败' });
    }
});

app.get('/api/circles', (req, res) => {
    const currentUser = req.query.user;
    try {
        const rows = db.prepare(`
            SELECT c.*, COUNT(cm.id) AS member_count
            FROM community_circles c
            LEFT JOIN circle_members cm ON cm.circle_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `).all();

        const joinedSet = new Set();
        if (currentUser) {
            const joined = db.prepare('SELECT circle_id FROM circle_members WHERE user_name = ?').all(currentUser);
            joined.forEach((row) => joinedSet.add(Number(row.circle_id)));
        }

        const data = rows.map((row) => ({
            ...row,
            member_count: Number(row.member_count || 0),
            joined: joinedSet.has(Number(row.id))
        }));
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取圈子列表失败' });
    }
});

app.post('/api/circles/:id/join', (req, res) => {
    const circleId = req.params.id;
    const { user } = req.body;
    if (!user) return res.status(400).json({ success: false, message: '缺少 user 参数' });

    try {
        const circle = db.prepare('SELECT id FROM community_circles WHERE id = ?').get(circleId);
        if (!circle) return res.status(404).json({ success: false, message: '圈子不存在' });

        db.prepare('INSERT OR IGNORE INTO circle_members (circle_id, user_name, role) VALUES (?, ?, ?)')
            .run(circleId, user, 'member');
        res.json({ success: true, message: '已加入圈子' });
    } catch (err) {
        res.status(500).json({ success: false, message: '加入圈子失败' });
    }
});

app.delete('/api/circles/:id/join', (req, res) => {
    const circleId = req.params.id;
    const { user } = req.body;
    if (!user) return res.status(400).json({ success: false, message: '缺少 user 参数' });

    try {
        db.prepare("DELETE FROM circle_members WHERE circle_id = ? AND user_name = ? AND role != 'owner'")
            .run(circleId, user);
        res.json({ success: true, message: '已退出圈子' });
    } catch (err) {
        res.status(500).json({ success: false, message: '退出圈子失败' });
    }
});

app.post('/api/community/posts', (req, res) => {
    const { author, circle_id, title, content, project_id } = req.body;
    const normalizedTitle = String(title || '').trim();
    const normalizedContent = String(content || '').trim();
    const normalizedType = 'discussion';

    if (!author || !normalizedTitle || !normalizedContent) {
        return res.status(400).json({ success: false, message: 'author/title/content 不能为空' });
    }

    try {
        if (circle_id) {
            const isMember = db.prepare('SELECT id FROM circle_members WHERE circle_id = ? AND user_name = ?').get(circle_id, author);
            if (!isMember) return res.status(403).json({ success: false, message: '加入圈子后才能在圈内发帖' });
        }

        if (project_id) {
            const project = db.prepare('SELECT * FROM team_projects WHERE id = ?').get(project_id);
            if (!project) return res.status(404).json({ success: false, message: '关联项目不存在' });
            if (!isProjectMember(project_id, author)) return res.status(403).json({ success: false, message: '仅项目成员可关联该项目' });
        }

        const result = db.prepare(`
            INSERT INTO community_posts (author, circle_id, title, content, post_type, project_id, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(
            author,
            circle_id || null,
            normalizedTitle,
            normalizedContent,
            normalizedType,
            project_id || null,
            '[]'
        );

        res.json({ success: true, message: '发布成功', data: { id: result.lastInsertRowid } });
    } catch (err) {
        res.status(500).json({ success: false, message: '社区发帖失败' });
    }
});

app.get('/api/community/posts', (req, res) => {
    const currentUser = req.query.user;
    const limit = Math.min(80, Math.max(1, Number(req.query.limit || 30)));

    try {
        const rows = db.prepare(`
            SELECT cp.*, cc.name AS circle_name
            FROM community_posts cp
            LEFT JOIN community_circles cc ON cc.id = cp.circle_id
            ORDER BY cp.created_at DESC
            LIMIT ?
        `).all(limit);

        let likedSet = new Set();
        if (currentUser) {
            const liked = db.prepare("SELECT post_id FROM community_reactions WHERE user_name = ? AND reaction_type = 'like'").all(currentUser);
            likedSet = new Set(liked.map((x) => Number(x.post_id)));
        }

        const data = rows.map((row) => ({
            ...row,
            liked_by_me: likedSet.has(Number(row.id))
        }));
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取社区帖子失败' });
    }
});

app.get('/api/community/recommendations', (req, res) => {
    const currentUser = req.query.user;
    const limit = Math.min(20, Math.max(1, Number(req.query.limit || 8)));
    if (!currentUser) return res.status(400).json({ success: false, message: '缺少 user 参数' });

    try {
        const user = db.prepare('SELECT * FROM users WHERE name = ?').get(currentUser);
        if (!user) return res.status(404).json({ success: false, message: '用户不存在' });

        upsertUserFeatureStore(user);
        const featureRow = db.prepare('SELECT * FROM user_feature_store WHERE user_name = ?').get(currentUser);
        const userSoft = safeJsonParse(featureRow ? featureRow.soft_tags : '{}', {});
        const userVector = safeJsonParse(featureRow ? featureRow.feature_vector : '[]', []);
        const joinedRows = db.prepare('SELECT circle_id FROM circle_members WHERE user_name = ?').all(currentUser);
        const joinedSet = new Set(joinedRows.map((x) => Number(x.circle_id)));

        const candidatePosts = db.prepare(`
            SELECT cp.*, cc.name AS circle_name
            FROM community_posts cp
            LEFT JOIN community_circles cc ON cc.id = cp.circle_id
            WHERE cp.author != ?
            ORDER BY cp.created_at DESC
            LIMIT 240
        `).all(currentUser);

        const postRec = candidatePosts.map((post) => {
            const text = `${post.title || ''} ${post.content || ''}`;
            const pVec = buildHashedVector(text);
            const semantic = cosineSimilarity(userVector, pVec);
            const interestOverlap = overlapScore(userSoft.interests || [], extractTagsFromText(text).interests || []);
            const engagement = Math.min(1, ((Number(post.likes_count || 0) * 2) + (Number(post.comments_count || 0) * 3) + (Number(post.views || 0) * 0.08)) / 30);
            const freshness = computeFreshnessScore(post.created_at);
            const joinedBoost = post.circle_id && joinedSet.has(Number(post.circle_id)) ? 0.08 : 0;
            const score = semantic * 0.52 + interestOverlap * 0.18 + engagement * 0.18 + freshness * 0.12 + joinedBoost;
            return {
                ...post,
                recommendation_score: Number((score * 100).toFixed(1)),
                recommendation_reasons: [
                    semantic > 0.35 ? '内容兴趣相关' : '',
                    engagement > 0.45 ? '互动活跃' : '',
                    freshness > 0.75 ? '发布较新' : '',
                    joinedBoost > 0 ? '来自你已加入圈子' : ''
                ].filter(Boolean).slice(0, 2)
            };
        }).sort((a, b) => b.recommendation_score - a.recommendation_score).slice(0, limit);

        const circles = db.prepare(`
            SELECT c.*, COUNT(cm.id) AS member_count
            FROM community_circles c
            LEFT JOIN circle_members cm ON cm.circle_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
            LIMIT 120
        `).all();

        const circleRec = circles
            .filter((circle) => !joinedSet.has(Number(circle.id)))
            .map((circle) => {
                const recent = db.prepare('SELECT title, content FROM community_posts WHERE circle_id = ? ORDER BY created_at DESC LIMIT 6').all(circle.id);
                const text = [circle.name, circle.description, ...recent.map((x) => `${x.title || ''} ${x.content || ''}`)].join(' ');
                const cVec = buildHashedVector(text);
                const semantic = cosineSimilarity(userVector, cVec);
                const popularity = Math.min(1, Number(circle.member_count || 0) / 60);
                const score = semantic * 0.72 + popularity * 0.28;
                return {
                    ...circle,
                    member_count: Number(circle.member_count || 0),
                    recommendation_score: Number((score * 100).toFixed(1)),
                    recommendation_reasons: [semantic > 0.3 ? '主题与你匹配' : '值得探索', popularity > 0.5 ? '圈子活跃度较高' : '新兴圈子']
                };
            })
            .sort((a, b) => b.recommendation_score - a.recommendation_score)
            .slice(0, Math.min(8, limit));

        res.json({ success: true, data: { posts: postRec, circles: circleRec } });
    } catch (err) {
        res.status(500).json({ success: false, message: '社区推荐计算失败' });
    }
});

// 17. 圈子 Feed
app.get('/api/circles/:id/feed', (req, res) => {
    const circleId = req.params.id;
    const limit = Math.min(60, Math.max(1, Number(req.query.limit || 20)));
    try {
        const rows = db.prepare(`
            SELECT cp.*, cc.name AS circle_name
            FROM community_posts cp
            LEFT JOIN community_circles cc ON cc.id = cp.circle_id
            WHERE cp.circle_id = ?
            ORDER BY cp.created_at DESC
            LIMIT ?
        `).all(circleId, limit);
        res.json({ success: true, data: rows.map((row) => ({ ...row, tags: safeJsonParse(row.tags, []) })) });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取圈子流失败' });
    }
});

// 18. 社区互动：浏览/评论/点赞
app.put('/api/community/posts/:id/view', (req, res) => {
    const postId = req.params.id;
    try {
        db.prepare('UPDATE community_posts SET views = views + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(postId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, message: '更新浏览失败' });
    }
});

app.post('/api/community/posts/:id/comments', (req, res) => {
    const postId = req.params.id;
    const { author, content } = req.body;
    const normalizedContent = String(content || '').trim();

    if (!author || !normalizedContent) {
        return res.status(400).json({ success: false, message: 'author/content 不能为空' });
    }

    try {
        const exists = db.prepare('SELECT id FROM community_posts WHERE id = ?').get(postId);
        if (!exists) return res.status(404).json({ success: false, message: '帖子不存在' });

        db.prepare('INSERT INTO community_comments (post_id, author, content) VALUES (?, ?, ?)')
            .run(postId, author, normalizedContent);
        db.prepare('UPDATE community_posts SET comments_count = comments_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(postId);

        res.json({ success: true, message: '评论成功' });
    } catch (err) {
        res.status(500).json({ success: false, message: '评论失败' });
    }
});

app.get('/api/community/posts/:id/comments', (req, res) => {
    const postId = req.params.id;
    const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
    try {
        const rows = db.prepare('SELECT * FROM community_comments WHERE post_id = ? ORDER BY created_at ASC LIMIT ?').all(postId, limit);
        res.json({ success: true, data: rows });
    } catch (err) {
        res.status(500).json({ success: false, message: '获取评论失败' });
    }
});

app.post('/api/community/posts/:id/like', (req, res) => {
    const postId = req.params.id;
    const { user } = req.body;
    if (!user) return res.status(400).json({ success: false, message: '缺少 user 参数' });

    try {
        const exists = db.prepare("SELECT id FROM community_reactions WHERE post_id = ? AND user_name = ? AND reaction_type = 'like'")
            .get(postId, user);

        if (exists) {
            db.prepare("DELETE FROM community_reactions WHERE post_id = ? AND user_name = ? AND reaction_type = 'like'")
                .run(postId, user);
            db.prepare('UPDATE community_posts SET likes_count = CASE WHEN likes_count > 0 THEN likes_count - 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
                .run(postId);
            return res.json({ success: true, liked: false });
        }

        db.prepare("INSERT INTO community_reactions (post_id, user_name, reaction_type) VALUES (?, ?, 'like')")
            .run(postId, user);
        db.prepare('UPDATE community_posts SET likes_count = likes_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(postId);
        return res.json({ success: true, liked: true });
    } catch (err) {
        return res.status(500).json({ success: false, message: '点赞操作失败' });
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
    const currentUser = req.query.user;
    try {
        db.prepare("UPDATE posts SET popularity = popularity + 1 WHERE id = ?").run(postId);
        if (currentUser) {
            recordRecommendationEvent(currentUser, postId, 'view', 1);
        }
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
