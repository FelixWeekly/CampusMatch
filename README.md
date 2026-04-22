#  CampusMatch  v0.0.0

> 一个轻量级、响应式的全栈 Web 应用，专为高校学生打造的“场景化”互助与任务匹配大厅。
> 解决校园内临时找人、技能互换、组队竞赛等高频痛点。

##  项目背景与价值
- 在校园生活中，学生经常面临“临时寻找吉他手”、“急需海报设计”、“寻找竞赛队友”等长尾需求。
- 传统的校园墙或微信群信息繁杂、难以检索且缺乏闭环，同时缺乏监管、初心为商业盈利。
- 本项目旨在打造一个**纯粹、简洁、高效**，且专注于校园微任务的匹配引擎，提供从**发布需求 -> 浏览大厅 -> 报名对接 -> 消息触达**的完整业务闭环。

##  核心功能

- **🔐 身份认证系统**：支持用户注册与登录，前端基于 `localStorage` 实现状态保持与路由守卫。
- **📝 动态大厅**：
  - 支持发布“寻人组队”与“提供技能”两类帖子。
  - 前端交互细节拉满：随发布类型动态切换的 Placeholder（提示词），防误触的独立操作区。
  - 权限控制：仅发帖人可安全删除自己的帖子（后端校验 + 数据库级联删除）。
- **🤝 报名与连接引擎**：用户可一键申请他人的帖子并附带留言。
- **📬 收件箱**：发帖人拥有独立的站内信件箱，实时查看有哪些人申请了自己的任务。

## 技术栈

本项目为了追求极致的加载速度与底层逻辑的掌控感，**前端零框架，后端极简依赖**：

- **前端 (Frontend)**：HTML5, CSS3, Vanilla JavaScript (原生 JS)
  - 使用 `Fetch API` 处理全量异步请求 (Async/Await)。
  - 纯 DOM 操控实现 CSR (客户端渲染) 与页面状态切换。
- **后端 (Backend)**：Node.js, Express.js, CORS
  - 遵循 **RESTful API** 设计规范。
- **数据库 (Database)**：原生 SQLite (`node:sqlite`)
  - 拥抱 Node.js 最新特性，直接调用底层内置 SQLite 引擎，免除第三方 C++ 编译依赖，实现轻量级持久化。
  - 运用 SQL `JOIN` 多表联合查询，实现复杂的消息收发逻辑。

##  快速启动

想要在本地运行此项目？只需简单的几步：

**1. 克隆项目**
\`\`\`bash
git clone https://github.com/FelixWeekly/CampusTasker.git
cd CampusTasker
\`\`\`

**2. 启动后端服务器**
\`\`\`bash
cd backend
npm install    # 安装 Express 和 CORS
node server.js # 启动服务器 (运行在 http://localhost:3000)
\`\`\`

**3. 启动前端页面**
- 使用 VS Code 打开项目。
- 推荐安装 `Live Server` 插件。
- 右键点击 `frontend/index.html`，选择 **"Open with Live Server"** 即可体验！

## 工程化亮点
1. **防 SQL 注入**：后端所有数据库交互均采用 `prepare statement` (预编译语句) 传参。
2. **关系型数据库设计**：建立 `users`、`posts`、`applications` 三张核心表，清晰映射“一对多”的实体关系。

## 智能推荐 MVP（已接入）

### 数据建模（先结构化，再推荐）
- 用户画像 Feature Store：
  - Hard Tags：年级、院系、校区
  - Soft Tags：技能、兴趣、MBTI（从自我介绍可选识别）、历史成功率
  - Vector：由用户文本简介与标签生成的语义向量
- 帖子特征：
  - 发布校区：由发布者个人资料自动继承
  - 跨校区开关：`accept_cross_campus`
  - 结构化标签 + 向量

### 推荐流程（两阶段）
1. Recall 召回剪枝：
  - 默认同校区过滤
  - 若帖子开启跨校区协作则放行
2. Ranking 排序打分：
   - 技能匹配 + 兴趣匹配 + MBTI 兼容 + 语义相似度 + 历史成功率

### 权重配置（可调）
当前默认权重：
```json
{
  "skill": 0.3,
  "interest": 0.2,
  "mbti": 0.1,
  "semantic": 0.3,
  "success": 0.1
}
```

### 关键 API

- `GET /api/recommendations?user=<用户名>&limit=6`
  - 返回推荐列表、召回数量、候选总量、当前权重

- `GET /api/recommendation-config`
  - 返回校区枚举、协作模式枚举、推荐权重

- `PUT /api/profile`
  - 支持字段：`campus`、`bio`（可选在 bio 中写 MBTI）

- `POST /api/posts`
  - 支持字段：`accept_cross_campus`

- `POST /api/location/off-campus/resolve`
  - 校外地址定位占位接口（当前返回 501）
  - 便于后续接入外部地图 API，不影响现有校区内匹配链路

### 快速联调示例

更新个人画像：
```bash
curl -X PUT http://localhost:3000/api/profile \
  -H "Content-Type: application/json" \
  -d '{
    "name": "张三",
    "department": "计算机学院",
    "grade": "2024级本科",
    "campus": "沙河校区",
    "bio": "我擅长后端与数据处理，偏好竞赛，MBTI 是 INTJ",
    "portfolio": ""
  }'
```

发布线下帖子：
```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Content-Type: application/json" \
  -d '{
    "author": "李四",
    "title": "招募算法同学打比赛",
    "content": "希望熟悉 Python 和机器学习，周末线下讨论更方便",
    "type": "寻人组队",
    "accept_cross_campus": false
  }'
```

获取推荐：
```bash
curl "http://localhost:3000/api/recommendations?user=张三&limit=6"
```

---
*Developed with ❤️ by Felix | 期待您的使用与反馈*
