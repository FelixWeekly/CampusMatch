(function () {
    const STORAGE_KEY = 'campusmatch-language';

    function getPreferredLanguage() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'en' || stored === 'zh') return stored;
        const browserLanguage = (navigator.language || navigator.userLanguage || '').toLowerCase();
        return browserLanguage.startsWith('en') ? 'en' : 'zh';
    }

    function setPreferredLanguage(language) {
        const normalized = language === 'en' ? 'en' : 'zh';
        localStorage.setItem(STORAGE_KEY, normalized);
        document.documentElement.lang = normalized === 'en' ? 'en' : 'zh-CN';
        document.documentElement.dataset.campusmatchLanguage = normalized;
        return normalized;
    }

    function getPageName() {
        const parts = window.location.pathname.replace(/\\/g, '/').split('/');
        const fileName = parts[parts.length - 1] || '';
        return fileName.replace(/\.html$/, '') || 'index';
    }

    function setText(selector, value, scope) {
        const root = scope || document;
        const node = root.querySelector(selector);
        if (!node) return;
        const iconNodes = node.querySelectorAll(':scope > .material-symbols-outlined');
        if (iconNodes.length) {
            const iconHtml = Array.from(iconNodes).map((icon) => icon.outerHTML).join(' ');
            node.innerHTML = value ? `${iconHtml} ${value}` : iconHtml;
            return;
        }
        node.textContent = value;
    }

    function setAllText(selector, values, scope) {
        const root = scope || document;
        const nodes = root.querySelectorAll(selector);
        nodes.forEach((node, index) => {
            if (values[index] !== undefined) node.textContent = values[index];
        });
    }

    function setPlaceholder(selector, value, scope) {
        const root = scope || document;
        const node = root.querySelector(selector);
        if (node) node.setAttribute('placeholder', value);
    }

    function setButtonHtml(selector, text, iconName, scope) {
        const root = scope || document;
        const node = root.querySelector(selector);
        if (node) node.innerHTML = `<span class="material-symbols-outlined">${iconName}</span> ${text}`;
    }

    function setCheckboxLabel(selector, text, scope) {
        const root = scope || document;
        const node = root.querySelector(selector);
        if (!node) return;
        const input = node.querySelector('input');
        node.textContent = '';
        if (input) node.appendChild(input);
        node.appendChild(document.createTextNode(` ${text}`));
    }

    function applyCommonShell(language) {
        const navLabels = language === 'en'
            ? ['Home', 'Projects', 'Community', 'Messages', 'Profile', 'Log out']
            : ['主页', '项目', '社区', '消息', '个人主页', '退出登录'];

        setText('.cm-brand-subtitle', language === 'en' ? 'Academic Workspace' : '连结 · 成长 · 无限可能');
        const sidebarButtons = document.querySelectorAll('.cm-sidebar .cm-nav-link');
        sidebarButtons.forEach((button, index) => {
            if (navLabels[index] !== undefined) {
                const icon = button.querySelector('.material-symbols-outlined');
                button.innerHTML = `${icon ? icon.outerHTML : ''} ${navLabels[index]}`;
            }
        });
    }

    function applyDashboard(language) {
        document.title = language === 'en' ? 'CampusMatch Workspace' : 'CampusMatch 工作区';
        setText('.cm-topbar > div > p', language === 'en' ? 'Here is your academic workspace for today.' : '今天你有什么想法吗？');
        setButtonHtml('.btn-inbox', language === 'en' ? 'Inbox' : '收件箱', 'notifications');
        setAllText('.flow-guide-title', language === 'en'
            ? ['Create Request', 'Browse Matches', 'Manage Work']
            : ['发起需求', '浏览帖子', '管理协作']);
        setAllText('.publish-card .cm-section-head .cm-eyebrow', language === 'en' ? ['New Collaboration'] : ['新机会']);
        setText('.publish-card h2', language === 'en' ? 'Post an opportunity' : '发布帖子');
        setText('.publish-card .form-label', language === 'en' ? 'Tags' : '标签');
        setPlaceholder('#post-title', language === 'en' ? 'e.g., AI Climate Research' : '你在什么方面存在需求？');
        setText('.publish-card .field-stack .form-label[for="post-title"]', language === 'en' ? 'Project Title' : '标题');
        setText('.publish-card .field-stack .form-label[for="post-content"]', language === 'en' ? 'Details' : '详情');
        setPlaceholder('#post-content', language === 'en' ? 'Describe what you are working on and who you are looking for...' : '描述你在做什么，以及希望找到什么样的伙伴...');
        setCheckboxLabel('.publish-checkboxes label:nth-of-type(1)', language === 'en' ? 'Enable project management' : '开启项目管理');
        setCheckboxLabel('.publish-checkboxes label:nth-of-type(2)', language === 'en' ? 'Paid' : '是否有报酬');
        setPlaceholder('#post-amount', language === 'en' ? 'Amount' : '金额');
        setCheckboxLabel('.publish-checkboxes label:nth-of-type(3)', language === 'en' ? 'Accept cross-campus collaboration' : '接受跨校区合作');
        setButtonHtml('.btn-publish', language === 'en' ? 'Post' : '发布', 'send');
        setAllText('#recommendation-section .cm-section-head .cm-eyebrow', language === 'en' ? ['AI Recommended'] : ['基于AI']);
        setText('#recommendation-section h2', language === 'en' ? 'Recommended for you' : '为你推荐');
        setButtonHtml('#recommendation-section .cm-button.ghost', language === 'en' ? 'Refresh' : '刷新', 'refresh');
        setAllText('#posts-section .cm-section-head .cm-eyebrow', language === 'en' ? ['Latest Opportunities'] : ['列表显示']);
        setText('#posts-section h2', language === 'en' ? 'Campus posts' : '最新帖子');
        setText('#toggle-posts-btn', language === 'en' ? 'Collapse list' : '收起列表');
        setPlaceholder('#filter-text', language === 'en' ? 'Search opportunities' : '搜索机会');
        setText('#filter-scope option[value="all"]', language === 'en' ? 'Scope: All' : '范围：全部');
        setText('#filter-scope option[value="mine"]', language === 'en' ? 'Scope: Mine' : '范围：我的');
        setText('#filter-compensation option[value="all"]', language === 'en' ? 'Pay: All' : '报酬：全部');
        setText('#filter-compensation option[value="paid"]', language === 'en' ? 'Pay: Paid' : '报酬：有偿');
        setText('#filter-compensation option[value="unpaid"]', language === 'en' ? 'Pay: Free' : '报酬：无偿');
        setText('#sort-by option[value="newest"]', language === 'en' ? 'Sort: Newest' : '排序：最新');
        setText('#sort-by option[value="popular"]', language === 'en' ? 'Sort: Popular' : '排序：最热');
        setText('#posts-section .cm-button.ghost[onclick="clearFilters()"]', language === 'en' ? 'Clear' : '清除');
        setAllText('#team-center-section .cm-section-head .cm-eyebrow', language === 'en' ? ['Active Projects'] : ['活跃项目']);
        setText('#team-center-section h2', language === 'en' ? 'Project workflow' : '项目流程');
        setButtonHtml('#team-center-section .cm-button.ghost[onclick="loadProjectPreviews()"]', language === 'en' ? 'Refresh' : '刷新', 'refresh');
        setText('#team-management-grid .project-list-panel h3', language === 'en' ? 'My managed collaborations' : '我管理的协作');
        setText('#my-projects-list .muted', language === 'en' ? 'No project records yet' : '暂无项目记录');
        setText('#project-detail-panel .muted', language === 'en' ? 'Select a project on the left to see a preview and quick actions.' : '选择左侧项目后，这里会展示流程预览与快速操作。');
        setText('#inbox-panel h2', language === 'en' ? 'Inbox' : '收件箱');
        setText('#inbox-messages .inbox-empty', language === 'en' ? 'Loading...' : '正在加载...');
        setButtonHtml('#inbox-detail-panel .cm-button.ghost[onclick="closeInboxDetail()"]', language === 'en' ? 'Back' : '返回', 'arrow_back');
        setText('#chat-with', language === 'en' ? 'Chat' : '聊天');
        setPlaceholder('#chat-input', language === 'en' ? 'Type a message...' : '输入私信...');
        setText('#chat-modal button[onclick="sendChatMessage()"]', language === 'en' ? 'Send' : '发送');
    }

    function applyCommunity(language) {
        document.title = language === 'en' ? 'Community - CampusMatch' : '社区 - CampusMatch';
        setText('#community-welcome', language === 'en' ? 'Community Plaza' : '社区广场');
        setText('.cm-topbar > div > p', language === 'en' ? 'Share updates, discover circles, and connect with teammates.' : '分享动态、发现圈子，与志同道合的人愉快交流吧');
        setButtonHtml('.header-btns .cm-button.ghost', language === 'en' ? 'Refresh' : '刷新', 'refresh');
        setText('#composer-trigger .cm-composer-placeholder', language === 'en' ? 'Share updates, papers, or ideas...' : '有什么要分享的吗？');
        setText('#community-post-circle option[value=""]', language === 'en' ? 'Public post' : '公开发布');
        setText('#community-post-project option[value=""]', language === 'en' ? 'Associated project (optional)' : '关联项目（可选）');
        setPlaceholder('#community-post-title', language === 'en' ? 'Post title' : '帖子标题');
        setPlaceholder('#community-post-content', language === 'en' ? 'What do you want to say?' : '想说点什么？');
        setText('.community-composer-form .cm-button.ghost', language === 'en' ? 'Cancel' : '取消');
        setButtonHtml('.community-composer-form .btn-publish', language === 'en' ? 'Post' : '发布', 'send');
        setText('#community-posts-container .cm-muted-message', language === 'en' ? 'Loading community content...' : '正在加载社区内容...');
        setText('.community-sidebar .cm-sidebar-card:nth-of-type(1) h3', language === 'en' ? 'Circle Discovery' : '发现');
        setText('.community-sidebar .cm-sidebar-card:nth-of-type(1) p', language === 'en' ? 'Browse active circles, support proposals, and join discussions.' : '浏览圈子，支持提议，加入讨论');
        setButtonHtml('.community-sidebar .cm-sidebar-card:nth-of-type(1) .cm-button', language === 'en' ? 'Browse circles' : '开始探索', 'explore');
        setText('.community-sidebar .cm-sidebar-card:nth-of-type(2) h3', language === 'en' ? 'Recommended for you' : '为你推荐');
        setText('.community-sidebar .cm-sidebar-card:nth-of-type(2) .cm-muted-message', language === 'en' ? 'Calculating...' : '计算中...');
        setText('.community-sidebar .cm-sidebar-card:nth-of-type(3) h3', language === 'en' ? 'Trending topics' : '热门话题');
        setText('.community-sidebar .cm-sidebar-card:nth-of-type(3) .cm-muted-message', language === 'en' ? 'Loading trends...' : '正在加载趋势...');
    }

    function applyMessages(language) {
        document.title = language === 'en' ? 'Messages - CampusMatch' : '消息 - CampusMatch';
        setText('.messages-panel-head h1', language === 'en' ? 'Messages' : '消息');
        setButtonHtml('.messages-panel-head .cm-button.ghost', '', 'refresh');
        setPlaceholder('#thread-search', language === 'en' ? 'Search conversations...' : '搜索会话...');
        setText('.messages-tabs button[data-filter="user"]', language === 'en' ? 'Direct' : '用户');
        setText('.messages-tabs button[data-filter="project"]', language === 'en' ? 'Projects' : '项目');
        setText('#thread-list .muted', language === 'en' ? 'Loading conversations...' : '正在加载会话...');
        setText('#conversation-title', language === 'en' ? 'Select a conversation' : '选择一个会话');
        setText('#conversation-status', language === 'en' ? 'Direct message' : '私信');
        setText('#conversation-history .muted', language === 'en' ? 'Choose a conversation from the left.' : '从左侧选择一个会话。');
        setPlaceholder('#message-input', language === 'en' ? 'Type a message...' : '输入消息...');
    }

    function applyProfile(language) {
        document.title = language === 'en' ? 'Profile - CampusMatch' : '个人主页 - CampusMatch';
        setButtonHtml('#btn-back-profile', language === 'en' ? 'Back' : '返回', 'arrow_back');
        setText('.profile-title', language === 'en' ? 'Academic Profile' : '个人资料');
        setText('.profile-topbar .muted', language === 'en' ? 'Skills, reputation, and collaboration history.' : '简介、评价与动态');
        setButtonHtml('#btn-delete-account', language === 'en' ? 'Delete account' : '注销账号', 'delete_forever');
        setText('#display-name', language === 'en' ? 'Loading...' : '加载中...');
        setText('#display-dept-grade', language === 'en' ? 'Department and grade loading...' : '院系年级加载中...');
        setText('#display-campus-hours', language === 'en' ? 'Campus info loading...' : '校区加载中...');
        setText('#display-bio', language === 'en' ? 'Loading...' : '加载中...');
        setText('#display-portfolio', language === 'en' ? 'View portfolio' : '查看作品集');
        setText('#display-feature-updated', language === 'en' ? '' : '');
        setText('.reviews-card .cm-eyebrow', language === 'en' ? 'Reputation' : '信誉');
        setText('.reviews-card h2', language === 'en' ? 'Task reviews' : '任务评价');
        setText('.average-score + .muted', language === 'en' ? 'Weighted score' : '加权分数');
        setText('#reviews-list .muted', language === 'en' ? 'No reviews yet' : '暂无评价记录');
        setText('.activity-board .cm-section-head h3', language === 'en' ? 'My activity' : '我的动态');
        setText('.activity-col strong:nth-of-type(1)', language === 'en' ? 'Ongoing' : '进行中');
        setText('.activity-col strong:nth-of-type(2)', language === 'en' ? 'History' : '历史记录');
        setText('#edit-modal h2', language === 'en' ? 'Edit profile' : '编辑资料');
        setPlaceholder('#edit-dept', language === 'en' ? 'Department' : '院系');
        setPlaceholder('#edit-grade', language === 'en' ? 'Grade' : '年级');
        setPlaceholder('#edit-portfolio', language === 'en' ? 'Personal site / portfolio link' : '个人主页 / 作品集链接');
        setPlaceholder('#edit-bio', language === 'en' ? 'Introduce your experience, skills, and preferences. You can include MBTI.' : '一句话介绍你的经历、技能、偏好，可写入 MBTI');
        setText('#edit-modal .cm-button.ghost', language === 'en' ? 'Cancel' : '取消');
        setText('#edit-modal .cm-button.secondary', language === 'en' ? 'Save profile' : '保存资料');
        setText('#delete-overlay button[onclick="closeDeleteAccount()"]', language === 'en' ? 'Close' : '关闭');
        setText('#delete-overlay h2', language === 'en' ? 'Delete account' : '注销账号');
        setText('#delete-overlay p', language === 'en' ? 'We are sorry to see you go. Please read carefully before continuing.' : '很遗憾你要离开，请在继续前仔细阅读。');
        setText('#delete-overlay h4', language === 'en' ? 'What happens next?' : '接下来会发生什么？');
        setText('#delete-overlay .cm-button', language === 'en' ? 'Keep account' : '保留账号');
        setText('#btn-delete-confirm', language === 'en' ? 'Permanently delete' : '永久删除');
    }

    function applyTeam(language) {
        document.title = language === 'en' ? 'Collaboration Hub - CampusMatch' : '协作中心 - CampusMatch';
        setText('#current-project-name', language === 'en' ? 'Select a project' : '选择一个项目');
        setPlaceholder('#switcher-search', language === 'en' ? 'Search projects...' : '搜索项目...');
        setText('.project-switcher-footer a', language === 'en' ? '+ New collaboration' : '+ 发起新协作');
        setText('#btn-pin-project', language === 'en' ? 'Pin' : '置顶');
        setText('#btn-project-chat', language === 'en' ? 'Chat' : '聊天');
        setText('#btn-invite-member', language === 'en' ? 'Collaborate' : '协作');
        setText('.project-tabs .project-tab[data-view="overview"]', language === 'en' ? 'Overview' : '概览');
        setText('.project-tabs .project-tab[data-view="issues"]', language === 'en' ? 'Requirements' : '需求');
        setText('.project-tabs .project-tab[data-view="members"]', language === 'en' ? 'Members' : '成员');
        setText('.project-tabs .project-tab[data-view="activity"]', language === 'en' ? 'Collaboration' : '协作');
        setText('.project-tabs .project-tab[data-view="checkins"]', language === 'en' ? 'Check-ins' : '打卡');
        setText('#project-placeholder', language === 'en' ? 'Select a project from the top bar to get started.' : '从顶部栏选择一个项目开始。');
    }

    function applyCircles(language) {
        document.title = language === 'en' ? 'Circle Discovery - CampusMatch' : '发现 - CampusMatch';
        setText('.cm-topbar > div > div span:last-child', language === 'en' ? 'Circle Discovery' : '发现');
        setText('.cm-topbar h1', language === 'en' ? 'Circle Discovery' : '发现');
        setText('.cm-topbar > div > p', language === 'en' ? 'Browse active circles, support proposals, and find your academic community.' : '浏览活跃圈子，支持感兴趣的提议，找到你的心仪社群。');
        setText('.cm-topbar .cm-button', language === 'en' ? 'Propose a new circle' : '发起新圈子');
        setPlaceholder('#circle-search', language === 'en' ? 'Search circles...' : '搜索圈子...');
        setAllText('#category-filters .circle-filter', language === 'en'
            ? ['All circles', 'Study', 'Technology', 'Social', 'Competitions']
            : ['全部圈子', '学习', '科技', '社会', '竞赛']);
        setText('#recommended-section h2', language === 'en' ? 'Recommended for you' : '为你推荐');
        setText('#active-circles-grid + p', language === 'en' ? 'Loading circles...' : '正在加载圈子...');
        setText('#proposals-list + p', language === 'en' ? 'Circle proposals' : '圈子提议');
        setText('#proposals-list ~ p', language === 'en' ? 'Circles need community support to become active. Each proposal requires 10 supporters.' : '圈子需要社区支持才能生效，每个提议需要 10 位支持者。');
        setText('#proposals-list .cm-muted-message', language === 'en' ? 'Loading proposals...' : '正在加载提议...');
        setText('#propose-overlay h3', language === 'en' ? 'Propose a new circle' : '发起新圈子');
        setText('#propose-name', language === 'en' ? '' : '');
        setPlaceholder('#propose-name', language === 'en' ? 'Circle name' : '请输入圈子名称');
        setText('label[for="propose-name"]', language === 'en' ? 'Circle name' : '圈子名称');
        setText('label[for="propose-category"]', language === 'en' ? 'Category' : '分类');
        setText('label[for="propose-desc"]', language === 'en' ? 'Description' : '简介');
        setPlaceholder('#propose-desc', language === 'en' ? 'Describe the purpose of this circle...' : '描述圈子的用途...');
        setText('#propose-overlay .cm-button.ghost', language === 'en' ? 'Cancel' : '取消');
        setText('#propose-overlay .cm-button.secondary', language === 'en' ? 'Start proposal' : '发起提议');
    }

    function applyCircle(language) {
        document.title = language === 'en' ? 'Circle - CampusMatch' : '圈子 - CampusMatch';
        setText('#circle-breadcrumb', language === 'en' ? 'Loading...' : '正在加载...');
        setText('#circle-title', language === 'en' ? 'Circle' : '圈子');
        setText('#circle-desc', language === 'en' ? 'Loading circle details...' : '正在加载圈子详情...');
        setText('#admin-actions .cm-button', language === 'en' ? 'Delete circle' : '删除圈子');
        setText('#circle-post-count', language === 'en' ? '0 posts' : '0 条帖子');
        setPlaceholder('#compose-title', language === 'en' ? 'Post title' : '帖子标题');
        setPlaceholder('#compose-content', language === 'en' ? 'Write a post in this circle...' : '在这个圈子里发帖...');
        setText('.cm-glass-card .cm-button.secondary', language === 'en' ? 'Post' : '发布');
        setText('#circle-feed .cm-muted-message', language === 'en' ? 'Loading posts...' : '正在加载帖子...');
    }

    function applyLanguage() {
        const language = setPreferredLanguage(getPreferredLanguage());
        applyCommonShell(language);

        switch (getPageName()) {
            case 'dashboard':
                applyDashboard(language);
                break;
            case 'community':
                applyCommunity(language);
                break;
            case 'messages':
                applyMessages(language);
                break;
            case 'profile':
                applyProfile(language);
                break;
            case 'team_management':
                applyTeam(language);
                break;
            case 'circles':
                applyCircles(language);
                break;
            case 'circle':
                applyCircle(language);
                break;
            default:
                break;
        }
    }

    window.getCampusMatchLanguage = getPreferredLanguage;
    window.setCampusMatchLanguage = setPreferredLanguage;
    window.applyCampusMatchLanguage = applyLanguage;

    document.addEventListener('DOMContentLoaded', applyLanguage);
    window.addEventListener('load', () => {
        window.setTimeout(applyLanguage, 0);
    });
})();