const currentUser = localStorage.getItem('currentUser');
const urlParams = new URLSearchParams(window.location.search);
const preferredProjectId = Number(urlParams.get('project') || 0);

const DEFAULT_VIEW_ORDER = ['overview', 'issues', 'members', 'activity', 'checkins'];
const VIEW_META = {
    overview: { label: '概览', hint: '总览和快捷操作' },
    issues: { label: '帖子', hint: '像在大厅里发帖子那样管理' },
    members: { label: '成员', hint: '中途调人和角色管理' },
    activity: { label: '协作', hint: '像 GitHub issue 一样发协作贴' },
    checkins: { label: '打卡', hint: '单独放到独立页面' }
};

const state = {
    projects: [],
    activeProjectId: null,
    activeProjectDetail: null,
    activeView: 'overview',
    viewOrder: [...DEFAULT_VIEW_ORDER],
    draftsByProject: {},
    filters: {
        issueStatus: 'all',
        issueSort: 'recent',
        activityStatus: 'all'
    }
};

let draggedViewKey = '';

        const DRAFT_FIELD_IDS = [
            'new-req-title',
            'new-req-desc',
            'new-req-priority',
            'new-req-assignee',
            'collab-title',
            'collab-body',
            'collab-target',
            'checkin-note',
            'checkin-completion',
            'new-member-name',
            'new-member-role',
            'rating-reviewee',
            'rating-comment'
        ];

        function statusLabel(status) {
            if (status === 'recruiting') return '招募中';
            if (status === 'executing') return '执行中';
            if (status === 'completed') return '已结项';
            return status || '未知';
        }

        function roleLabel(role) {
            if (role === 'leader') return '负责人';
            if (role === 'core_member') return '核心成员';
            return '普通成员';
        }

function requirementStatusLabel(status) {
    if (status === 'open') return '待开始';
    if (status === 'in_progress') return '进行中';
    if (status === 'blocked') return '阻塞';
    if (status === 'done') return '已完成';
    return status || '未知';
}

function requirementPriorityLabel(priority) {
    if (priority === 'high') return '高优先级';
    if (priority === 'medium') return '中优先级';
    if (priority === 'low') return '低优先级';
    return priority || '未设置';
}

function formatTime(value) {
    if (!value) return '-';
    const normalized = String(value).includes('T') ? String(value) : String(value).replace(' ', 'T');
    const parsed = new Date(normalized);
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleString('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function priorityScore(priority) {
    if (priority === 'high') return 3;
    if (priority === 'medium') return 2;
    if (priority === 'low') return 1;
    return 0;
}

function splitPostContent(value) {
    const text = String(value || '').trim();
    if (!text) return { title: '未命名协作贴', body: '' };
    const parts = text.split(/\n\s*\n/);
    const title = String(parts[0] || '').trim() || '未命名协作贴';
    const body = parts.slice(1).join('\n\n').trim();
    return { title, body };
}

function composePostContent(title, body) {
    const main = String(title || '').trim();
    const detail = String(body || '').trim();
    if (!main && !detail) return '';
    return detail ? `${main}\n\n${detail}` : main;
}

function draftBucketKey() {
    return String(state.activeProjectId || 'global');
}

function getDraftBucket() {
    const key = draftBucketKey();
    if (!state.draftsByProject[key]) {
        state.draftsByProject[key] = {};
    }
    return state.draftsByProject[key];
}

function captureDrafts() {
    const drafts = {};
    const bucket = getDraftBucket();
    DRAFT_FIELD_IDS.forEach((id) => {
        const field = document.getElementById(id);
        if (field) drafts[id] = field.value;
    });
    Object.assign(bucket, drafts);
    return drafts;
}

function restoreDrafts() {
    const bucket = getDraftBucket();
    DRAFT_FIELD_IDS.forEach((id) => {
        const field = document.getElementById(id);
        if (field && Object.prototype.hasOwnProperty.call(bucket, id)) {
            field.value = bucket[id];
        }
    });
}

function clearDrafts(ids) {
    const bucket = getDraftBucket();
    ids.forEach((id) => {
        const field = document.getElementById(id);
        if (field) field.value = '';
        bucket[id] = '';
    });
}

function syncLocation() {
    try {
        const params = new URLSearchParams(window.location.search);
        if (state.activeProjectId) {
            params.set('project', String(state.activeProjectId));
        }
        params.set('view', state.activeView);
        const nextUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', nextUrl);
    } catch (err) {
    }
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function storageKey(name) {
    return `team-center:${currentUser || 'guest'}:${name}`;
}

function normalizeView(view) {
    return VIEW_META[view] ? view : 'overview';
}

function normalizeViewOrder(order) {
    const source = Array.isArray(order) ? order : [];
    const seen = new Set();
    const nextOrder = [];

    [...source, ...DEFAULT_VIEW_ORDER].forEach((view) => {
        if (!VIEW_META[view] || seen.has(view)) return;
        seen.add(view);
        nextOrder.push(view);
    });

    return nextOrder;
}

function loadViewOrder() {
    try {
        const raw = localStorage.getItem(storageKey('view-order'));
        if (!raw) return [...DEFAULT_VIEW_ORDER];
        return normalizeViewOrder(JSON.parse(raw));
    } catch (err) {
        return [...DEFAULT_VIEW_ORDER];
    }
}

function saveViewOrder() {
    try {
        localStorage.setItem(storageKey('view-order'), JSON.stringify(state.viewOrder));
    } catch (err) {
    }
}

function loadActiveView() {
    const stored = localStorage.getItem(storageKey('active-view'));
    return normalizeView(stored || urlParams.get('view') || 'overview');
}

function saveActiveView(view) {
    try {
        localStorage.setItem(storageKey('active-view'), view);
    } catch (err) {
    }
}

function goBackDashboard() {
    window.location.href = 'dashboard.html';
}

async function initializeProjectCenter() {
    if (!currentUser) {
        alert('请先登录');
        window.location.href = 'index.html';
        return;
    }

    state.viewOrder = normalizeViewOrder(loadViewOrder());
    state.activeView = loadActiveView();
    renderViewNav();
    updateWorkspaceHeader();
    await loadProjects();
}

function updateWorkspaceHeader() {
    const titleEl = document.getElementById('team-workspace-title');
    const subtitleEl = document.getElementById('team-workspace-subtitle');
    const detail = state.activeProjectDetail;

    if (!titleEl || !subtitleEl) return;

    if (!detail) {
        titleEl.textContent = '请选择一个项目';
        subtitleEl.textContent = '左侧先选中一个项目，再切换下方视图。';
        return;
    }

    const project = detail.project;
    const members = detail.members || [];
    const requirements = detail.requirements || [];
    const feedback = detail.feedback || [];

    titleEl.textContent = project.title || '未命名项目';
    subtitleEl.textContent = `${statusLabel(project.status)} · ${members.length} 名成员 · ${requirements.length} 个需求 · ${feedback.filter((item) => item.status === 'open').length} 条待处理协作贴`;
}

async function loadProjects() {
    const panel = document.getElementById('team-main-panel');
    try {
        const resp = await fetch(`http://localhost:3000/api/my-projects?user=${encodeURIComponent(currentUser)}`);
        const json = await resp.json();
        if (!json.success) {
            if (panel) panel.innerHTML = `<p class="team-empty">${escapeHtml(json.message || '获取项目失败')}</p>`;
            return;
        }

        state.projects = json.data || [];
        renderProjectList();

        if (!state.projects.length) {
            state.activeProjectId = null;
            state.activeProjectDetail = null;
            updateWorkspaceHeader();
            renderViewNav();
            if (panel) {
                panel.innerHTML = `
                    <div class="team-card">
                        <h3>还没有项目</h3>
                        <p class="team-empty">你还没有加入开启项目管理的项目。先回大厅发布一个需求，并勾选开启项目管理。</p>
                    </div>
                `;
            }
            syncLocation();
            return;
        }

        const preferred = state.projects.find((project) => project.id === preferredProjectId);
        const stored = state.projects.find((project) => project.id === state.activeProjectId);
        const initial = preferred || stored || state.projects[0];
        state.activeProjectId = initial.id;
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        if (panel) panel.innerHTML = '<p class="team-empty">加载失败，请检查后端服务。</p>';
    }
}

function renderProjectList() {
    const box = document.getElementById('team-project-list');
    if (!box) return;

    if (!state.projects.length) {
        box.innerHTML = '<p class="team-empty">暂无项目</p>';
        return;
    }

    box.innerHTML = state.projects.map((project) => `
        <button class="team-project-item ${project.id === state.activeProjectId ? 'active' : ''}" onclick="switchProject(${project.id})">
            <strong>${escapeHtml(project.title || '未命名项目')}</strong>
            <span>${statusLabel(project.status)} · ${project.member_count || 0} 人</span>
            <span>${escapeHtml(project.post_title || project.title || '')}</span>
        </button>
    `).join('');
}

function renderViewNav() {
    const box = document.getElementById('team-view-nav');
    if (!box) return;

    if (!state.activeProjectDetail) {
        box.innerHTML = '';
        return;
    }

    box.innerHTML = state.viewOrder.map((view) => {
        const meta = VIEW_META[view];
        return `
            <div
                class="team-view-item ${view === state.activeView ? 'active' : ''}"
            >
                <button type="button" class="team-view-main" onclick="switchView('${view}')">
                    <strong>${meta.label}</strong>
                </button>
            </div>
        `;
    }).join('');
}

function beginViewDrag(view, event) {
    draggedViewKey = view;
    if (event?.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', view);
    }
}

function allowViewDrop(event) {
    event.preventDefault();
    if (event?.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }
}

function dropView(targetView, event) {
    event.preventDefault();
    const sourceView = draggedViewKey || event?.dataTransfer?.getData('text/plain') || '';
    draggedViewKey = '';

    if (!sourceView || sourceView === targetView) return;

    const sourceIndex = state.viewOrder.indexOf(sourceView);
    const targetIndex = state.viewOrder.indexOf(targetView);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const nextOrder = [...state.viewOrder];
    nextOrder.splice(sourceIndex, 1);
    nextOrder.splice(targetIndex, 0, sourceView);
    state.viewOrder = normalizeViewOrder(nextOrder);
    saveViewOrder();
    renderViewNav();
}

function endViewDrag() {
    draggedViewKey = '';
}

async function switchProject(projectId) {
    captureDrafts();
    state.activeProjectId = projectId;
    renderProjectList();
    await loadProjectDetail(projectId, { captureDraftsBeforeRefresh: false });
}

function switchView(view) {
    state.activeView = normalizeView(view);
    saveActiveView(state.activeView);
    renderViewNav();
    renderCurrentView();
    syncLocation();
}

function resetViewOrder() {
    state.viewOrder = [...DEFAULT_VIEW_ORDER];
    saveViewOrder();
    renderViewNav();
}

async function loadProjectDetail(projectId, options = {}) {
    const panel = document.getElementById('team-main-panel');
    if (options.captureDraftsBeforeRefresh !== false) {
        captureDrafts();
    }
    if (panel) panel.innerHTML = '<p class="team-empty">正在加载项目详情...</p>';

    try {
        const [detailResp, feedbackResp] = await Promise.all([
            fetch(`http://localhost:3000/api/projects/${projectId}/detail?user=${encodeURIComponent(currentUser)}`),
            fetch(`http://localhost:3000/api/projects/${projectId}/feedback?user=${encodeURIComponent(currentUser)}`)
        ]);

        const detailJson = await detailResp.json();
        const feedbackJson = await feedbackResp.json();

        if (!detailJson.success) {
            if (panel) panel.innerHTML = `<p class="team-empty">${escapeHtml(detailJson.message || '加载失败')}</p>`;
            return;
        }

        state.activeProjectDetail = {
            ...detailJson.data,
            feedback: feedbackJson.success ? (feedbackJson.data || []) : [],
            feedbackCanManage: feedbackJson.success ? !!feedbackJson.can_manage : false
        };

        updateWorkspaceHeader();
        renderViewNav();
        renderCurrentView();
        restoreDrafts();
        syncLocation();
    } catch (err) {
        if (panel) panel.innerHTML = '<p class="team-empty">网络错误，加载失败。</p>';
    }
}

function getDetailParts() {
    const detail = state.activeProjectDetail || {};
    return {
        project: detail.project || {},
        members: detail.members || [],
        milestones: detail.milestones || [],
        checkins: detail.checkins || [],
        requirements: detail.requirements || [],
        scoreboard: detail.scoreboard || [],
        feedback: detail.feedback || [],
        canManage: !!detail.can_manage,
        feedbackCanManage: !!detail.feedbackCanManage
    };
}

function renderCurrentView() {
    const panel = document.getElementById('team-main-panel');
    if (!panel) return;
    captureDrafts();

    if (!state.activeProjectDetail) {
        panel.innerHTML = '<p class="team-empty">请选择一个项目。</p>';
        return;
    }

    const detail = getDetailParts();

    if (state.activeView === 'issues') {
        panel.innerHTML = renderIssuesView(detail);
        restoreDrafts();
        return;
    }
    if (state.activeView === 'members') {
        panel.innerHTML = renderMembersView(detail);
        restoreDrafts();
        return;
    }
    if (state.activeView === 'activity') {
        panel.innerHTML = renderActivityView(detail);
        restoreDrafts();
        return;
    }
    if (state.activeView === 'checkins') {
        panel.innerHTML = renderCheckinsView(detail);
        restoreDrafts();
        return;
    }

    panel.innerHTML = renderOverviewView(detail);
    restoreDrafts();
}

function renderOverviewView(detail) {
    const project = detail.project;
    const members = detail.members;
    const requirements = detail.requirements;
    const feedback = detail.feedback;
    const scoreboard = detail.scoreboard;
    const canManage = detail.canManage;
    const openIssues = requirements.filter((item) => item.status !== 'done').length;
    const openPosts = feedback.filter((item) => item.status === 'open').length;
    const resolvedPosts = feedback.filter((item) => item.status === 'resolved').length;
    const latestIssue = requirements[0];
    const latestPost = feedback[0];

    return `
        <section class="team-card team-hero-card">
            <div class="team-card-head">
                <div>
                    <p class="team-eyebrow">概览</p>
                    <h2>${escapeHtml(project.title || '未命名项目')}</h2>
                </div>
                <span class="team-status-chip">${statusLabel(project.status)}</span>
            </div>
            <div class="team-actions-row">
                ${canManage ? `
                    <button onclick="changeProjectStatus('recruiting')">设为招募</button>
                    <button onclick="changeProjectStatus('executing')">进入执行</button>
                    <button onclick="changeProjectStatus('completed')">结项</button>
                ` : '<span class="muted">仅队长可切换状态</span>'}
                <button onclick="switchView('issues')">发需求</button>
                <button onclick="switchView('activity')">看协作贴</button>
                <button onclick="switchView('members')">调成员</button>
            </div>
            <div class="team-summary-grid">
                <article class="team-summary-card">
                    <span>成员</span>
                    <strong>${members.length}</strong>
                </article>
                <article class="team-summary-card">
                    <span>开放需求</span>
                    <strong>${openIssues}</strong>
                </article>
                <article class="team-summary-card">
                    <span>待处理协作贴</span>
                    <strong>${openPosts}</strong>
                </article>
                <article class="team-summary-card">
                    <span>已关闭协作贴</span>
                    <strong>${resolvedPosts}</strong>
                </article>
            </div>
            <div class="team-overview-pair">
                <div class="team-overview-box">
                    <div class="team-overview-box-head">
                        <h3>最近需求</h3>
                        <button type="button" class="team-panel-ghost" onclick="switchView('issues')">打开需求页</button>
                    </div>
                    ${latestIssue ? `
                        <div class="issue-card issue-card-compact">
                            <div class="issue-card-head">
                                <div>
                                    <strong>${escapeHtml(latestIssue.title)}</strong>
                                    <p>${requirementStatusLabel(latestIssue.status)} · ${requirementPriorityLabel(latestIssue.priority)} · ${escapeHtml(latestIssue.assignee || '未分配')}</p>
                                </div>
                                <span class="issue-chip issue-chip-soft">需求</span>
                            </div>
                            <p>${escapeHtml(latestIssue.description || '暂无说明')}</p>
                        </div>
                    ` : '<p class="team-empty">暂无需求记录</p>'}
                </div>
                <div class="team-overview-box">
                    <div class="team-overview-box-head">
                        <h3>最近协作贴</h3>
                        <button type="button" class="team-panel-ghost" onclick="switchView('activity')">打开协作页</button>
                    </div>
                    ${latestPost ? `
                        <div class="issue-card issue-card-compact">
                            <div class="issue-card-head">
                                <div>
                                    <strong>${escapeHtml(splitPostContent(latestPost.content).title)}</strong>
                                    <p>${latestPost.status === 'resolved' ? '已关闭' : '进行中'} · ${escapeHtml(latestPost.category || 'discussion')} · ${escapeHtml(latestPost.target_user || '全员可看')}</p>
                                </div>
                                <span class="issue-chip issue-chip-soft">协作贴</span>
                            </div>
                            <p>${escapeHtml(splitPostContent(latestPost.content).body || '暂无补充说明')}</p>
                        </div>
                    ` : '<p class="team-empty">暂无协作贴</p>'}
                </div>
            </div>
            <section class="team-card" style="margin:12px 0 0 0;">
                <div class="team-card-head">
                    <div>
                        <h3>最近协作贴</h3>
                    </div>
                    <button type="button" class="team-panel-ghost" onclick="switchView('activity')">查看完整活动页</button>
                </div>
                <div class="issue-list">
                    ${feedback.slice(0, 4).map((item) => renderFeedbackItem(item, detail.feedbackCanManage)).join('') || '<p class="team-empty">暂无协作贴</p>'}
                </div>
            </section>
        </section>

        ${project.status === 'completed' ? renderRatingBoard(project, members, scoreboard) : ''}
    `;
}

function renderIssuesView(detail) {
    const project = detail.project;
    const members = detail.members;
    const requirements = detail.requirements;
    const canManage = detail.canManage;
    const filtered = filterIssues(requirements);
    const issueCount = requirements.length;
    const openCount = requirements.filter((item) => item.status !== 'done').length;
    const revieweeOptions = members
        .filter((member) => member.user_name !== currentUser)
        .map((member) => `<option value="${escapeHtml(member.user_name)}">${escapeHtml(member.user_name)}</option>`)
        .join('');

    return `
        <section class="team-card">
            <div class="team-card-head">
                <div>
                    <p class="team-eyebrow">帖子 / 协作</p>
                    <h2>${escapeHtml(project.title || '未命名项目')}</h2>
                </div>
                <div class="team-issue-stats">
                    <span class="issue-chip">总计 ${issueCount}</span>
                    <span class="issue-chip issue-chip-soft">未完成 ${openCount}</span>
                </div>
            </div>
            <div class="issue-compose-grid">
                <div class="issue-compose-main">
                    <input id="new-req-title" type="text" placeholder="帖子标题">
                    <textarea id="new-req-desc" rows="8" placeholder="补充背景、目标和你想要的结果"></textarea>
                </div>
                <aside class="issue-compose-meta">
                    <label for="new-req-priority">优先级</label>
                    <select id="new-req-priority">
                        <option value="high">高优先级</option>
                        <option value="medium" selected>中优先级</option>
                        <option value="low">低优先级</option>
                    </select>
                    <label for="new-req-assignee">指派成员</label>
                    <select id="new-req-assignee">
                        <option value="">暂不分配</option>
                        ${members.map((member) => `<option value="${escapeHtml(member.user_name)}">${escapeHtml(member.user_name)}</option>`).join('')}
                    </select>
                    <div class="issue-compose-note">发布后会直接进帖子列表，和大厅的帖子流保持一致。</div>
                    <button class="issue-submit-btn" onclick="createRequirement()">发布帖子</button>
                </aside>
            </div>
        </section>

        <section class="team-card">
            <div class="team-card-head">
                <div>
                    <h3>帖子列表</h3>
                </div>
                <div class="team-inline-filters">
                    <select id="issue-status-filter" onchange="setIssueStatusFilter(this.value)">
                        <option value="all" ${state.filters.issueStatus === 'all' ? 'selected' : ''}>全部状态</option>
                        <option value="open" ${state.filters.issueStatus === 'open' ? 'selected' : ''}>待开始</option>
                        <option value="in_progress" ${state.filters.issueStatus === 'in_progress' ? 'selected' : ''}>进行中</option>
                        <option value="blocked" ${state.filters.issueStatus === 'blocked' ? 'selected' : ''}>阻塞</option>
                        <option value="done" ${state.filters.issueStatus === 'done' ? 'selected' : ''}>已完成</option>
                    </select>
                    <select id="issue-sort" onchange="setIssueSort(this.value)">
                        <option value="recent" ${state.filters.issueSort === 'recent' ? 'selected' : ''}>最近更新</option>
                        <option value="priority" ${state.filters.issueSort === 'priority' ? 'selected' : ''}>优先级优先</option>
                    </select>
                </div>
            </div>
            <div class="issue-list">
                ${filtered.map((item) => renderIssueCard(item, members, canManage, revieweeOptions)).join('') || '<p class="team-empty">暂无需求记录</p>'}
            </div>
        </section>
    `;
}

function filterIssues(requirements) {
    let list = [...requirements];
    if (state.filters.issueStatus !== 'all') {
        list = list.filter((item) => item.status === state.filters.issueStatus);
    }

    list.sort((left, right) => {
        if (state.filters.issueSort === 'priority') {
            const scoreDiff = priorityScore(right.priority) - priorityScore(left.priority);
            if (scoreDiff !== 0) return scoreDiff;
        }

        const leftTime = new Date(String(left.updated_at || left.created_at || '').replace(' ', 'T')).getTime() || 0;
        const rightTime = new Date(String(right.updated_at || right.created_at || '').replace(' ', 'T')).getTime() || 0;
        return rightTime - leftTime || Number(right.id || 0) - Number(left.id || 0);
    });

    return list;
}

function renderIssueCard(item, members, canManage, revieweeOptions) {
    const canUpdateStatus = canManage || item.assignee === currentUser || item.created_by === currentUser;
    const canEditMeta = canManage;
    return `
        <article class="issue-card">
            <div class="issue-card-head">
                <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <div class="issue-card-meta">
                        <span class="issue-chip">${requirementStatusLabel(item.status)}</span>
                        <span class="issue-chip issue-chip-soft">${requirementPriorityLabel(item.priority)}</span>
                        <span class="issue-chip issue-chip-soft">${escapeHtml(item.assignee || '未分配')}</span>
                    </div>
                </div>
                <div class="issue-card-side-meta">
                    <span>由 ${escapeHtml(item.created_by || '系统')} 发布</span>
                    <span>${formatTime(item.updated_at || item.created_at)}</span>
                </div>
            </div>
            <p class="issue-card-desc">${escapeHtml(item.description || '暂无说明')}</p>
            <div class="issue-card-actions">
                <select id="req-status-${item.id}" ${canUpdateStatus ? '' : 'disabled'}>
                    <option value="open" ${item.status === 'open' ? 'selected' : ''}>待开始</option>
                    <option value="in_progress" ${item.status === 'in_progress' ? 'selected' : ''}>进行中</option>
                    <option value="blocked" ${item.status === 'blocked' ? 'selected' : ''}>阻塞</option>
                    <option value="done" ${item.status === 'done' ? 'selected' : ''}>已完成</option>
                </select>
                <button onclick="updateRequirementStatus(${item.id})" ${canUpdateStatus ? '' : 'disabled'}>更新状态</button>
                ${canEditMeta ? `
                    <select id="req-assignee-${item.id}">
                        <option value="">未分配</option>
                        ${members.map((member) => `<option value="${escapeHtml(member.user_name)}" ${member.user_name === item.assignee ? 'selected' : ''}>${escapeHtml(member.user_name)}</option>`).join('')}
                    </select>
                    <button onclick="reassignRequirement(${item.id})">改派</button>
                ` : ''}
            </div>
        </article>
    `;
}

function setIssueStatusFilter(value) {
    state.filters.issueStatus = value || 'all';
    renderCurrentView();
}

function setIssueSort(value) {
    state.filters.issueSort = value || 'recent';
    renderCurrentView();
}

function renderMembersView(detail) {
    const project = detail.project;
    const members = detail.members;
    const canManage = detail.canManage;

    return `
        <section class="team-card">
            <div class="team-card-head">
                <div>
                    <p class="team-eyebrow">成员管理</p>
                    <h2>${escapeHtml(project.title || '未命名项目')}</h2>
                </div>
                <button type="button" class="team-panel-ghost" onclick="switchView('activity')">去活动页</button>
            </div>
            <div class="member-list">
                ${members.length ? members.map((member) => renderMemberItem(member, canManage)).join('') : '<p class="team-empty">暂无成员</p>'}
            </div>
            ${canManage ? `
                <div class="member-compose">
                    <input id="new-member-name" type="text" placeholder="成员用户名">
                    <select id="new-member-role">
                        <option value="member">普通成员</option>
                        <option value="core_member">核心成员</option>
                        <option value="leader">负责人</option>
                    </select>
                    <button onclick="addProjectMember()">新增成员</button>
                </div>
            ` : '<p class="team-empty">仅负责人可新增成员和调整角色。</p>'}
        </section>
    `;
}

function renderMemberItem(member, canManage) {
    const canSelfLeave = member.user_name === currentUser && member.role !== 'leader';
    return `
        <article class="member-card">
            <div>
                <strong>${escapeHtml(member.user_name)}</strong>
                <p>${roleLabel(member.role)} · 加入时间 ${escapeHtml(member.joined_at || '-')}</p>
            </div>
            <div class="member-ops">
                ${canManage ? `
                    <select id="member-role-${encodeURIComponent(member.user_name)}">
                        <option value="leader" ${member.role === 'leader' ? 'selected' : ''}>负责人</option>
                        <option value="core_member" ${member.role === 'core_member' ? 'selected' : ''}>核心成员</option>
                        <option value="member" ${member.role === 'member' ? 'selected' : ''}>普通成员</option>
                    </select>
                    <button onclick="updateProjectMemberRole('${encodeURIComponent(member.user_name)}')">改角色</button>
                    ${(member.user_name !== currentUser || member.role !== 'leader') ? `<button class="danger" onclick="removeProjectMember('${encodeURIComponent(member.user_name)}')">移出</button>` : ''}
                ` : ''}
                ${!canManage && canSelfLeave ? `<button class="danger" onclick="removeProjectMember('${encodeURIComponent(member.user_name)}')">退出项目</button>` : ''}
            </div>
        </article>
    `;
}

function renderActivityView(detail) {
    const project = detail.project;
    const feedback = detail.feedback;
    const feedbackCanManage = detail.feedbackCanManage;
    const members = detail.members;
    const filtered = filterCollaborativePosts(feedback);

    return `
        <section class="team-card">
            <div class="team-card-head">
                <div>
                    <p class="team-eyebrow">协作贴</p>
                    <h2>${escapeHtml(project.title || '未命名项目')}</h2>
                </div>
                <button type="button" class="team-panel-ghost" onclick="switchView('issues')">去需求页</button>
            </div>
            <div class="issue-compose-grid">
                <div class="issue-compose-main">
                    <input id="collab-title" type="text" placeholder="标题">
                    <textarea id="collab-body" rows="7" placeholder="把背景、卡点、做法和你希望别人怎么接手写清楚"></textarea>
                </div>
                <aside class="issue-compose-meta">
                    <label for="collab-category">类型</label>
                    <select id="collab-category">
                        <option value="discussion">讨论</option>
                        <option value="task">任务</option>
                        <option value="blocker">卡点</option>
                        <option value="resource">资源</option>
                        <option value="other">其他</option>
                    </select>
                    <button class="issue-submit-btn" onclick="createFeedback()">发布协作贴</button>
                </aside>
            </div>
        </section>

        <section class="team-card">
            <div class="team-card-head">
                <div>
                    <h3>协作贴列表</h3>
                </div>
                <select id="activity-status-filter" onchange="setActivityStatusFilter(this.value)">
                    <option value="all" ${state.filters.activityStatus === 'all' ? 'selected' : ''}>全部状态</option>
                    <option value="open" ${state.filters.activityStatus === 'open' ? 'selected' : ''}>进行中</option>
                    <option value="resolved" ${state.filters.activityStatus === 'resolved' ? 'selected' : ''}>已关闭</option>
                </select>
            </div>
            <div class="issue-list">
                ${filtered.map((item) => renderFeedbackItem(item, feedbackCanManage)).join('') || '<p class="team-empty">暂无协作贴</p>'}
            </div>
        </section>
    `;
}

function filterCollaborativePosts(posts) {
    let list = [...posts];
    if (state.filters.activityStatus !== 'all') {
        list = list.filter((item) => item.status === state.filters.activityStatus);
    }

    list.sort((left, right) => {
        const leftTime = new Date(String(left.updated_at || left.created_at || '').replace(' ', 'T')).getTime() || 0;
        const rightTime = new Date(String(right.updated_at || right.created_at || '').replace(' ', 'T')).getTime() || 0;
        return rightTime - leftTime || Number(right.id || 0) - Number(left.id || 0);
    });

    return list;
}

function setActivityStatusFilter(value) {
    state.filters.activityStatus = value || 'all';
    renderCurrentView();
}

function renderFeedbackItem(item, canManage) {
    const post = splitPostContent(item.content);
    const canDelete = item.author === currentUser || canManage;
    const actionLabel = item.status === 'resolved' ? '重开' : '关闭';
    return `
        <article class="issue-card">
            <div class="issue-card-head">
                <div>
                    <strong>${escapeHtml(post.title)}</strong>
                    <div class="issue-card-meta">
                        <span class="issue-chip">${item.status === 'resolved' ? '已关闭' : '进行中'}</span>
                        <span class="issue-chip issue-chip-soft">${escapeHtml(item.category || 'discussion')}</span>
                        <span class="issue-chip issue-chip-soft">${escapeHtml(item.target_user || '全员可看')}</span>
                    </div>
                </div>
                <div class="issue-card-side-meta">
                    <span>${escapeHtml(item.author || '系统')}</span>
                    <span>${formatTime(item.created_at)}</span>
                </div>
            </div>
            <p class="issue-card-desc">${escapeHtml(post.body || '暂无补充说明')}</p>
            ${item.resolution_note ? `<p class="issue-card-desc">处理说明：${escapeHtml(item.resolution_note)}</p>` : ''}
            <div class="issue-card-actions">
                ${canManage ? `<button onclick="updateFeedback(${item.id}, '${item.status === 'resolved' ? 'open' : 'resolved'}')">${actionLabel}</button>` : ''}
                ${canDelete ? `<button class="danger" onclick="deleteFeedback(${item.id})">${item.author === currentUser ? '撤回' : '删除'}</button>` : ''}
            </div>
        </article>
    `;
}

function renderCheckinsView(detail) {
    const project = detail.project;
    const checkins = detail.checkins;
    const canManage = detail.canManage;

    return `
        <section class="team-card">
            <div class="team-card-head">
                <div>
                    <p class="team-eyebrow">打卡</p>
                    <h2>${escapeHtml(project.title || '未命名项目')}</h2>
                </div>
                <button type="button" class="team-panel-ghost" onclick="switchView('activity')">去协作贴</button>
            </div>
            <div class="checkin-compose">
                <input id="checkin-note" type="text" placeholder="今天完成了什么？">
                <input id="checkin-completion" type="number" min="0" max="100" placeholder="完成度 0-100">
                <button onclick="submitCheckin()">提交打卡</button>
            </div>
            <div class="checkin-list">
                ${checkins.length ? checkins.map((item) => renderCheckinItem(item, canManage)).join('') : '<p class="team-empty">暂无打卡记录</p>'}
            </div>
        </section>
    `;
}

function renderCheckinItem(item, canManage) {
    const canDelete = canManage || item.user_name === currentUser;
    return `
        <article class="checkin-card">
            <div>
                <strong>${escapeHtml(item.user_name)} · ${item.task_completion}%</strong>
                <p>${escapeHtml(item.progress_note || '无')}
                </p>
                <span class="timeline-meta">${formatTime(item.created_at)}</span>
            </div>
            ${canDelete ? `<button class="danger" onclick="deleteCheckin(${item.id})">删除</button>` : ''}
        </article>
    `;
}

function renderRatingBoard(project, members, scoreboard) {
    const revieweeOptions = members
        .filter((member) => member.user_name !== currentUser)
        .map((member) => `<option value="${escapeHtml(member.user_name)}">${escapeHtml(member.user_name)}</option>`)
        .join('');

    return `
        <section class="team-card">
            <div class="team-card-head">
                <div>
                    <h3>结项评分看板</h3>
                </div>
            </div>
            <div class="team-score-wrap">
                <table class="score-table">
                    <thead>
                        <tr>
                            <th>成员</th><th>打卡率</th><th>完成度</th><th>客观分</th><th>主观分</th><th>总分</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${scoreboard.map((item) => `<tr><td>${escapeHtml(item.user_name)}</td><td>${item.checkin_rate}%</td><td>${item.task_completion_avg}%</td><td>${item.objective_score}</td><td>${item.subjective_score}</td><td>${item.final_score}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="rating-compose">
                <select id="rating-reviewee">
                    <option value="">选择队友</option>
                    ${revieweeOptions}
                </select>
                <select id="rating-score">
                    <option value="5">5分</option>
                    <option value="4">4分</option>
                    <option value="3">3分</option>
                    <option value="2">2分</option>
                    <option value="1">1分</option>
                </select>
                <input id="rating-comment" type="text" placeholder="评价说明（可选）">
                <button onclick="submitProjectRating()">提交互评</button>
            </div>
        </section>
    `;
}

async function changeProjectStatus(status) {
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '状态更新失败');
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，状态更新失败');
    }
}

async function createRequirement() {
    const title = (document.getElementById('new-req-title')?.value || '').trim();
    const description = (document.getElementById('new-req-desc')?.value || '').trim();
    const priority = document.getElementById('new-req-priority')?.value || 'medium';
    const assignee = document.getElementById('new-req-assignee')?.value || '';

    if (!title) return alert('请输入帖子标题');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/requirements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, title, description, priority, assignee })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '发布帖子失败');
        clearDrafts(['new-req-title', 'new-req-desc', 'new-req-priority', 'new-req-assignee']);
        const priorityField = document.getElementById('new-req-priority');
        if (priorityField) priorityField.value = 'medium';
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，发布帖子失败');
    }
}

async function updateRequirementStatus(requirementId) {
    const status = document.getElementById(`req-status-${requirementId}`)?.value || 'open';
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/requirements/${requirementId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '状态更新失败');
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，状态更新失败');
    }
}

async function reassignRequirement(requirementId) {
    const assignee = document.getElementById(`req-assignee-${requirementId}`)?.value || '';
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/requirements/${requirementId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, assignee })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '改派失败');
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，改派失败');
    }
}

async function addProjectMember() {
    const userName = (document.getElementById('new-member-name')?.value || '').trim();
    const role = document.getElementById('new-member-role')?.value || 'member';
    if (!userName) return alert('请输入成员用户名');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, user_name: userName, role })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '新增成员失败');
        clearDrafts(['new-member-name', 'new-member-role']);
        const roleField = document.getElementById('new-member-role');
        if (roleField) roleField.value = 'member';
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，新增成员失败');
    }
}

async function updateProjectMemberRole(encodedUserName) {
    const userName = decodeURIComponent(encodedUserName || '');
    const role = document.getElementById(`member-role-${encodedUserName}`)?.value || 'member';
    if (!userName) return;

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/members/${encodeURIComponent(userName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, role })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '角色调整失败');
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，角色调整失败');
    }
}

async function removeProjectMember(encodedUserName) {
    const userName = decodeURIComponent(encodedUserName || '');
    if (!userName) return;
    if (!confirm(`确定将 ${userName} 移出项目吗？`)) return;

    let reassignTo = '';
    const canManage = state.activeProjectDetail && state.activeProjectDetail.can_manage;
    if (canManage) {
        reassignTo = prompt('如果该成员有未完成需求，可输入改派目标成员，留空则取消指派') || '';
    }

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/members/${encodeURIComponent(userName)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, reassign_to: reassignTo.trim() })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '成员移除失败');
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，成员移除失败');
    }
}

async function createFeedback() {
    const title = (document.getElementById('collab-title')?.value || '').trim();
    const body = (document.getElementById('collab-body')?.value || '').trim();
    const category = document.getElementById('collab-category')?.value || 'discussion';
    const target = document.getElementById('collab-target')?.value || '';
    const content = composePostContent(title, body);
    if (!content) return alert('请输入标题或内容');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, content, target_user: target, category })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '发布失败');
        clearDrafts(['collab-title', 'collab-body', 'collab-category', 'collab-target']);
        const categoryField = document.getElementById('collab-category');
        if (categoryField) categoryField.value = 'discussion';
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，发布失败');
    }
}

async function updateFeedback(feedbackId, status) {
    const resolutionNote = prompt(status === 'resolved' ? '输入处理说明（可选）' : '输入复开说明（可选）') || '';

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/feedback/${feedbackId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status, resolution_note: resolutionNote })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '更新失败');
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，更新失败');
    }
}

async function deleteFeedback(feedbackId) {
    if (!confirm('确定撤回/删除该反馈吗？')) return;

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/feedback/${feedbackId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '操作失败');
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，操作失败');
    }
}

async function submitCheckin() {
    const note = (document.getElementById('checkin-note')?.value || '').trim();
    const completion = Number(document.getElementById('checkin-completion')?.value);

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/checkins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser, progress_note: note, task_completion: completion })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '打卡失败');
        clearDrafts(['checkin-note', 'checkin-completion']);
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，打卡失败');
    }
}

async function deleteCheckin(checkinId) {
    if (!confirm('确定删除该打卡记录吗？')) return;

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/checkins/${checkinId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '删除失败');
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，删除失败');
    }
}

async function submitProjectRating() {
    const reviewee = document.getElementById('rating-reviewee')?.value;
    const score = Number(document.getElementById('rating-score')?.value || 5);
    const comment = (document.getElementById('rating-comment')?.value || '').trim();
    if (!reviewee) return alert('请选择队友');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/ratings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewer: currentUser, reviewee, score, comment })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '提交失败');
        clearDrafts(['rating-reviewee', 'rating-score', 'rating-comment']);
        await loadProjectDetail(state.activeProjectId);
    } catch (err) {
        alert('网络错误，提交失败');
    }
}

async function refreshAll() {
    await loadProjects();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeProjectCenter);
} else {
    initializeProjectCenter();
}
