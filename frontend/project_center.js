/* ── Collaborative Hub - Project Center ── */
const currentUser = localStorage.getItem('currentUser');
const urlParams = new URLSearchParams(window.location.search);
const preferredProjectId = Number(urlParams.get('project') || 0);

const VIEW_META = {
    overview: { label: 'Overview' },
    issues: { label: 'Requirements' },
    members: { label: 'Members' },
    activity: { label: 'Collaboration' },
    checkins: { label: 'Check-ins' }
};

const state = {
    projects: [],
    activeProjectId: null,
    activeProjectDetail: null,
    activeView: 'overview',
    drafts: {}
};

function campusMatchLanguage() {
    return window.getCampusMatchLanguage ? window.getCampusMatchLanguage() : ((localStorage.getItem('campusmatch-language') || 'zh') === 'en' ? 'en' : 'zh');
}

function projectCopy(zh, en) {
    return campusMatchLanguage() === 'en' ? en : zh;
}

/* ── Utilities ── */
function escapeHtml(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function statusLabel(s) {
    if (campusMatchLanguage() === 'en') {
        if (s === 'recruiting') return 'Recruiting';
        if (s === 'executing') return 'In progress';
        if (s === 'completed') return 'Completed';
        return s || 'Unknown';
    }
    if (s === 'recruiting') return '招募中';
    if (s === 'executing') return '进行中';
    if (s === 'completed') return '已完成';
    return s || '未知';
}

function formatTime(v) {
    if (!v) return '-';
    const d = new Date(String(v).includes('T') ? v : String(v).replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function priorityLabel(p) {
    if (campusMatchLanguage() === 'en') {
        if (p === 'high') return 'High';
        if (p === 'medium') return 'Medium';
        return 'Low';
    }
    if (p === 'high') return '高';
    if (p === 'medium') return '中';
    return '低';
}

/* ── Init ── */
window.onload = function () {
    if (!currentUser) {
        alert(projectCopy('请先登录', 'Please login first'));
        window.location.href = 'index.html';
        return;
    }
    loadProjects().then(() => {
        if (preferredProjectId) { selectProject(preferredProjectId, true); return; }
        loadPinnedProject();
    });
    document.addEventListener('click', (e) => {
        const sw = document.getElementById('project-switcher-dropdown');
        const tr = document.getElementById('project-switcher-trigger');
        if (sw && sw.classList.contains('open') && !sw.contains(e.target) && e.target !== tr && !tr.contains(e.target)) {
            closeSwitcher();
        }
    });
};

/* ── Project Switcher ── */
async function loadProjects() {
    try {
        const resp = await fetch(`http://localhost:3000/api/my-projects?user=${encodeURIComponent(currentUser)}`);
        const json = await resp.json();
        if (json.success) {
            state.projects = json.data || [];
        }
        renderSwitcherList();
    } catch (_) {}
}

function renderSwitcherList(filter) {
    const list = document.getElementById('switcher-project-list');
    if (!list) return;
    let items = state.projects;
    if (filter) {
        const q = filter.toLowerCase();
        items = items.filter((p) => (p.title || '').toLowerCase().includes(q));
    }
    if (!items.length) {
        list.innerHTML = `<div style="padding:16px;text-align:center;color:var(--outline);font-size:13px;">${projectCopy('未找到项目', 'No projects found')}</div>`;
        return;
    }
    list.innerHTML = items.map((p) => {
        const active = p.id === state.activeProjectId ? ' active' : '';
        const memberCount = p.member_count || 0;
        const msTotal = p.milestone_count || 0;
        const msDone = p.completed_milestone_count || 0;
        return `
            <div class="project-switcher-item${active}" onclick="selectProject(${p.id})">
                <div class="project-switcher-item-info">
                    <div class="project-switcher-item-name">${escapeHtml(p.title || projectCopy('未命名', 'Untitled'))}</div>
                    <div class="project-switcher-item-meta">
                        <span>${memberCount} ${projectCopy('成员', 'members')}</span>
                        <span>${msDone}/${msTotal} ${projectCopy('里程碑', 'milestones')}</span>
                    </div>
                </div>
                <div class="project-switcher-item-status">
                    <span class="cm-chip" style="font-size:10px;">${statusLabel(p.status)}</span>
                </div>
            </div>
        `;
    }).join('');
}

function toggleProjectSwitcher() {
    const dd = document.getElementById('project-switcher-dropdown');
    const tr = document.getElementById('project-switcher-trigger');
    if (!dd || !tr) return;
    const open = dd.classList.contains('open');
    if (open) { closeSwitcher(); return; }
    dd.classList.add('open');
    tr.classList.add('open');
    document.getElementById('switcher-search').value = '';
    renderSwitcherList();
    setTimeout(() => document.getElementById('switcher-search').focus(), 100);
}

function closeSwitcher() {
    const dd = document.getElementById('project-switcher-dropdown');
    const tr = document.getElementById('project-switcher-trigger');
    if (dd) dd.classList.remove('open');
    if (tr) tr.classList.remove('open');
}

function filterSwitcherProjects() {
    const q = document.getElementById('switcher-search')?.value || '';
    renderSwitcherList(q);
}

function selectProject(projectId, silent) {
    closeSwitcher();
    if (state.activeProjectId === projectId && !silent) return;
    state.activeProjectId = projectId;
    state.activeView = 'overview';
    document.getElementById('project-placeholder').style.display = 'none';
    document.getElementById('project-view-container').style.display = '';
    document.getElementById('project-tabs').style.display = 'flex';
    document.getElementById('btn-invite-member').style.display = '';
    document.getElementById('btn-pin-project').style.display = '';
    document.getElementById('btn-project-chat').style.display = '';
    updatePinIcon();
    document.getElementById('current-project-name').textContent =
        (state.projects.find((p) => p.id === projectId) || {}).title || projectCopy('未命名', 'Untitled');
    loadProjectDetail(projectId);
}

/* ── Pin to Top ── */
function getPinnedProjectId() {
    try {
        const v = localStorage.getItem('cm_pinned_project');
        return v ? Number(v) : null;
    } catch (_) { return null; }
}

function setPinnedProjectId(id) {
    try {
        if (id) localStorage.setItem('cm_pinned_project', String(id));
        else localStorage.removeItem('cm_pinned_project');
    } catch (_) {}
}

function togglePinProject() {
    if (!state.activeProjectId) return;
    const pinned = getPinnedProjectId();
    if (pinned === state.activeProjectId) {
        setPinnedProjectId(null);
    } else {
        setPinnedProjectId(state.activeProjectId);
    }
    updatePinIcon();
}

function updatePinIcon() {
    const icon = document.getElementById('pin-icon');
    const btn = document.getElementById('btn-pin-project');
    if (!icon || !btn) return;
    const pinned = getPinnedProjectId();
    if (pinned === state.activeProjectId) {
        icon.style.fontVariationSettings = "'FILL' 1";
        icon.textContent = 'push_pin';
        btn.childNodes[btn.childNodes.length - 1].textContent = campusMatchLanguage() === 'en' ? ' Pinned' : ' 已置顶';
    } else {
        icon.style.fontVariationSettings = "'FILL' 0";
        icon.textContent = 'push_pin';
        btn.childNodes[btn.childNodes.length - 1].textContent = campusMatchLanguage() === 'en' ? ' Pin' : ' 置顶';
    }
}

function openProjectChat() {
    if (state.activeProjectId) {
        window.location.href = 'messages.html?project=' + state.activeProjectId;
    }
}

function loadPinnedProject() {
    const pinnedId = getPinnedProjectId();
    if (pinnedId && state.projects.some((p) => p.id === pinnedId)) {
        selectProject(pinnedId, true);
    }
}

/* ── Load Project Detail ── */
async function loadProjectDetail(projectId) {
    const container = document.getElementById('project-view-container');
    container.innerHTML = `<p class="team-empty">${projectCopy('加载中...', 'Loading...')}</p>`;
    try {
        const [detailResp, feedbackResp] = await Promise.all([
            fetch(`http://localhost:3000/api/projects/${projectId}/detail?user=${encodeURIComponent(currentUser)}`),
            fetch(`http://localhost:3000/api/projects/${projectId}/feedback?user=${encodeURIComponent(currentUser)}`)
        ]);
        const detailJson = await detailResp.json();
        const feedbackJson = await feedbackResp.json();
        if (!detailJson.success) {
            container.innerHTML = `<p class="team-empty">${escapeHtml(detailJson.message || projectCopy('加载失败', 'Load failed'))}</p>`;
            return;
        }
        state.activeProjectDetail = {
            ...detailJson.data,
            feedback: feedbackJson.success ? (feedbackJson.data || []) : [],
            feedbackCanManage: feedbackJson.success ? !!feedbackJson.can_manage : false
        };
        renderCurrentView();
        initAvatars();
        if (state.activeView === 'members') loadExitRequests();
    } catch (err) {
        console.error('[loadProjectDetail]', err);
        container.innerHTML = `<p class="team-empty">${projectCopy('网络错误', 'Network error')}: ${escapeHtml(err.message || projectCopy('未知错误', 'unknown'))}</p>`;
    }
}

function initAvatars() {
    var els = document.querySelectorAll('.cm-avatar-sm[data-user]');
    for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.getAttribute('data-avatar-loading') === '1' || el.getAttribute('data-avatar-loaded') === '1') continue;
        var user = decodeAvatarUser(el.getAttribute('data-user'));
        if (!user || user.indexOf('project:') === 0) continue;
        if (el.querySelector('img[data-avatar-image]')) continue;
        var img = document.createElement('img');
        img.setAttribute('data-avatar-image', '1');
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onload = function() {
            var host = this.parentElement;
            if (!host) return;
            host.setAttribute('data-avatar-loaded', '1');
            host.removeAttribute('data-avatar-loading');
            clearAvatarFallbackText(host);
        };
        img.onerror = function() {
            var host = this.parentElement;
            if (host) host.removeAttribute('data-avatar-loading');
            this.remove();
        };
        el.setAttribute('data-avatar-loading', '1');
        img.src = 'http://localhost:3000/api/users/avatar/' + encodeURIComponent(user) + '/raw';
        el.insertBefore(img, el.firstChild);
    }
}

function decodeAvatarUser(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        return decodeURIComponent(raw);
    } catch (_) {
        return raw;
    }
}

function clearAvatarFallbackText(el) {
    for (var node = el.firstChild; node; node = node.nextSibling) {
        if (node.nodeType === 3) node.nodeValue = '';
    }
}

/* ── View Switching ── */
function switchView(view) {
    state.activeView = view;
    document.querySelectorAll('.project-tab').forEach((t) => {
        t.classList.toggle('active', t.dataset.view === view);
    });
    renderCurrentView();
    initAvatars();
    if (view === 'members') loadExitRequests();
}

function getDetailParts() {
    const d = state.activeProjectDetail || {};
    return {
        project: d.project || {},
        members: d.members || [],
        milestones: d.milestones || [],
        checkins: d.checkins || [],
        requirements: d.requirements || [],
        scoreboard: d.scoreboard || [],
        feedback: d.feedback || [],
        canManage: !!d.can_manage,
        feedbackCanManage: !!d.feedbackCanManage
    };
}

function renderCurrentView() {
    const container = document.getElementById('project-view-container');
    if (!container || !state.activeProjectDetail) return;
    const detail = getDetailParts();
    const views = {
        overview: renderOverview,
        issues: renderIssues,
        members: renderMembers,
        activity: renderActivity,
        checkins: renderCheckins
    };
    const fn = views[state.activeView];
    container.innerHTML = fn ? fn(detail) : `<p class="team-empty">${projectCopy('当前视图不可用', 'View not available')}</p>`;
    if (state.activeView === 'issues') restoreDrafts();
    if (state.activeView === 'activity') { restoreDrafts(); initCollabLabelPicker(); }
}

/* ── Collab Label Picker (matches dashboard's labelChipHtml exactly) ── */
const COLLAB_LABELS = ['寻人组队', '提供技能', '自定义'];

function collabLabelChipHtml(label, selected) {
    const bg = selected ? 'var(--primary-container)' : '#f8fafc';
    const color = selected ? 'var(--primary)' : '#334155';
    const border = selected ? 'var(--primary-container-strong)' : '#cbd5e1';
    return `<button type="button" onclick="selectCollabLabel('${label}')" style="height:28px;line-height:normal;width:auto;padding:0 12px;border-radius:999px;border:1px solid ${border};background:${bg};color:${color};font-size:12px;font-family:inherit;cursor:pointer;box-sizing:border-box;margin:0;outline:none;text-align:center;vertical-align:middle;"># ${label}</button>`;
}

function initCollabLabelPicker() {
    const picker = document.getElementById('collab-label-picker');
    if (!picker) return;
    if (!state._collabLabel) state._collabLabel = '寻人组队';
    const currentCustom = document.getElementById('collab-custom-label')?.value || '';
    let chips = COLLAB_LABELS.map((label) => collabLabelChipHtml(label, state._collabLabel === label)).join('');
    if (state._collabLabel === '自定义') {
        chips += `
            <input type="text" id="collab-custom-label" maxlength="12" placeholder="在此输入"
                style="height:28px;line-height:normal;width:80px;min-width:80px;max-width:320px;padding:0 12px;border-radius:999px;border:1px solid var(--primary-container-strong);background:var(--primary-container);color:var(--primary);font-size:12px;font-family:inherit;box-sizing:border-box;margin:0;outline:none;text-align:center;vertical-align:middle;">`;
    }
    picker.innerHTML = chips;
    if (state._collabLabel === '自定义') {
        const input = document.getElementById('collab-custom-label');
        if (input && currentCustom) input.value = currentCustom;
    }
}

function selectCollabLabel(label) {
    if (state._collabLabel === label) { state._collabLabel = null; }
    else { state._collabLabel = label; }
    initCollabLabelPicker();
}

/* ── Drafts ── */
function captureDrafts() {
    const fields = ['new-req-title', 'new-req-desc', 'new-req-priority', 'new-req-assignee',
        'collab-title', 'collab-body', 'collab-target', 'checkin-note', 'checkin-completion',
        'new-member-name', 'new-member-role', 'rating-reviewee', 'rating-comment'];
    fields.forEach((id) => {
        const el = document.getElementById(id);
        if (el) state.drafts[id] = el.value || '';
    });
}

function restoreDrafts() {
    Object.keys(state.drafts).forEach((id) => {
        const el = document.getElementById(id);
        if (el && state.drafts[id]) el.value = state.drafts[id];
    });
}

/* ── Overview View ── */
function buildTimeline(milestones) {
    if (!milestones || !milestones.length) {
        return `<div class="cm-glass-card" style="text-align:center;padding:32px;color:var(--outline);">${projectCopy('暂无里程碑', 'No milestones yet')}</div>`;
    }
    const total = milestones.length;
    const completed = milestones.filter((m) => m.status === 'completed').length;
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const currentIdx = milestones.findIndex((m) => m.status !== 'completed');
    const activeIdx = currentIdx >= 0 ? currentIdx : total - 1;

    const nodes = milestones.map((m, i) => {
        let cls = 'future';
        if (m.status === 'completed') cls = 'completed';
        else if (i === activeIdx) cls = 'current';
        const leftPct = total > 1 ? (i / (total - 1)) * 100 : 50;
        const checkIcon = m.status === 'completed'
            ? '<span class="material-symbols-outlined" style="font-size:11px;">check</span>' : '';
        const hoverTitle = escapeHtml(m.title) + (m.due_date ? ' · Due ' + escapeHtml(m.due_date) : '');
        const currentCard = cls === 'current'
            ? `<div class="project-timeline-current-card" style="left:${leftPct}%;transform:translateX(-50%);">Current: ${escapeHtml(m.title)}</div>` : '';
        return `${currentCard}<div class="project-timeline-node ${cls}" style="left:${leftPct}%;" title="${hoverTitle}">
            <div class="project-timeline-node-dot">${checkIcon}</div>
            <div class="project-timeline-node-label">${escapeHtml(m.title)}</div>
        </div>`;
    }).join('');

    return `
        <div class="cm-glass-card" style="padding:20px 24px;">
            <h3 style="margin:0 0 4px;font-size:17px;font-weight:800;">${projectCopy('项目时间线', 'Project Timeline')}</h3>
            <div class="project-timeline">
                <div class="project-timeline-track">
                    <div class="project-timeline-progress" style="width:${progressPct}%;"></div>
                </div>
                ${nodes}
            </div>
        </div>
    `;
}

function buildHeatmapPlaceholder() {
    const now = new Date();
    const monthLabel = campusMatchLanguage() === 'en'
        ? now.toLocaleString('en', { month: 'long', year: 'numeric' })
        : now.toLocaleString('zh-CN', { month: 'long', year: 'numeric' });
    const dayLabels = campusMatchLanguage() === 'en'
        ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
        : ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `
        <div class="cm-glass-card" style="width:fit-content;min-width:0;">
            <h3 style="margin:0 0 4px;font-size:17px;font-weight:800;">${projectCopy('活动热力图', 'Activity Heatmap')}</h3>
            <p style="margin:0 0 12px;font-size:12px;color:var(--outline);">${monthLabel} · ${projectCopy('项目总贡献', 'Project total contributions')}</p>
            <div class="heatmap-container">
                <div class="heatmap-day-labels">${dayLabels.map((d) => `<span>${d}</span>`).join('')}</div>
                <div class="heatmap-grid" id="heatmap-grid"></div>
                <div class="heatmap-legend">
                    <span>${projectCopy('少', 'Less')}</span>
                    <div class="heatmap-cell"></div>
                    <div class="heatmap-cell level-1"></div>
                    <div class="heatmap-cell level-2"></div>
                    <div class="heatmap-cell level-3"></div>
                    <div class="heatmap-cell level-4"></div>
                    <div class="heatmap-cell level-5"></div>
                    <span>${projectCopy('多', 'More')}</span>
                </div>
            </div>
        </div>
    `;
}

function renderMilestoneManager(detail) {
    const { milestones, canManage } = detail;
    return `
        <div class="cm-glass-card" style="margin-top:14px;">
            <h3 style="margin:0 0 14px;font-size:17px;font-weight:800;">${projectCopy('里程碑', 'Milestones')} (${milestones.length})</h3>
            ${canManage ? `
            <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;align-items:center;">
                <input id="new-ms-title" type="text" placeholder="${projectCopy('里程碑标题', 'Milestone title')}" style="flex:1;min-width:160px;min-height:40px;">
                <input id="new-ms-date" type="date" style="max-width:150px;min-height:40px;">
                <button onclick="createMilestone()" class="cm-button" style="min-height:40px;white-space:nowrap;">
                    <span class="material-symbols-outlined">add</span> ${projectCopy('添加', 'Add')}
                </button>
            </div>` : ''}
            <div id="milestone-list">
                ${milestones.map((m) => {
                    const done = m.status === 'completed';
                    return `
                        <div class="sprint-task${done ? ' done' : ''}" style="align-items:center;">
                            <div class="sprint-task-icon" style="cursor:${canManage ? 'pointer' : 'default'};" onclick="${canManage ? `toggleMilestone(${m.id},'${done ? 'pending' : 'completed'}')` : ''}">
                                ${done ? '<span class="material-symbols-outlined" style="font-size:12px;">check</span>' : ''}
                            </div>
                            <div class="sprint-task-info">
                                <div class="sprint-task-title">${escapeHtml(m.title)}</div>
                                <div class="sprint-task-meta">
                                    ${m.due_date ? `<span>${projectCopy('截止', 'Due')} ${escapeHtml(m.due_date)}</span>` : `<span>${projectCopy('无截止时间', 'No due date')}</span>`}
                                    <span>${done ? projectCopy('已完成', 'Completed') + ' ' + formatTime(m.completed_at) : projectCopy('待处理', 'Pending')}</span>
                                </div>
                            </div>
                            ${canManage ? `
                            <button class="cm-button ghost" style="font-size:11px;min-height:26px;padding:2px 8px;flex-shrink:0;" onclick="deleteMilestone(${m.id})" title="${projectCopy('删除', 'Delete')}">
                                <span class="material-symbols-outlined" style="font-size:16px;">close</span>
                            </button>` : ''}
                        </div>
                    `;
                }).join('') || `<p style="font-size:13px;color:var(--outline);padding:12px 0;">${projectCopy('暂无里程碑，先加一个开始追踪进度。', 'No milestones yet. Add one to start tracking progress.')}</p>`}
            </div>
        </div>
    `;
}

function buildHeatmapJS() {
    if (!state.activeProjectId) return '';
    setTimeout(async () => {
        const grid = document.getElementById('heatmap-grid');
        if (!grid) return;
        try {
            const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/heatmap?user=${encodeURIComponent(currentUser)}`);
            const json = await resp.json();
            if (!json.success || !json.data) { grid.innerHTML = `<div style="padding:12px;color:var(--outline);font-size:12px;">${projectCopy('暂无数据', 'No data')}</div>`; return; }
            const { grid: weeks } = json.data;
            if (!weeks || !weeks.length) { grid.innerHTML = `<div style="padding:12px;color:var(--outline);font-size:12px;">${projectCopy('本月暂无贡献', 'No contributions this month')}</div>`; return; }

            grid.innerHTML = weeks.map((week) => {
                const cells = week.map((day) => {
                    if (!day) return '<div class="heatmap-cell" style="visibility:hidden;"></div>';
                    const t = day.total || 0;
                    const level = t >= 5 ? 5 : (t >= 4 ? 4 : (t >= 3 ? 3 : (t >= 2 ? 2 : (t >= 1 ? 1 : 0))));
                    const memberList = Object.entries(day.members || {}).map(([name, cnt]) => `${name}: ${cnt}`).join(', ');
                    const title = t > 0
                        ? projectCopy(`${day.date} — ${t} 项贡献\n${memberList}`, `${day.date} — ${t} contribution${t > 1 ? 's' : ''}\n${memberList}`)
                        : projectCopy(`${day.date} — 无活动`, `${day.date} — No activity`);
                    return `<div class="heatmap-cell${level > 0 ? ' level-' + level : ''}" title="${title.replace(/"/g, '&quot;')}" style="cursor:${t > 0 ? 'pointer' : 'default'};"></div>`;
                }).join('');
                return `<div class="heatmap-row">${cells}</div>`;
            }).join('');
        } catch (_) {
            grid.innerHTML = `<div style="padding:12px;color:var(--error);font-size:12px;">${projectCopy('加载失败', 'Failed to load')}</div>`;
        }
    }, 50);
    return '';
}

function renderOverview(detail) {
    const { project, members, milestones, requirements, feedback } = detail;
    const openReqs = requirements.filter((r) => r.status !== 'done').length;
    const openPosts = feedback.filter((f) => f.status === 'open').length;

    return `
        <div>
            <p class="cm-eyebrow">${projectCopy('概览', 'Overview')}</p>
            <h2>${escapeHtml(project.title || projectCopy('未命名', 'Untitled'))}</h2>
        </div>

        ${buildTimeline(milestones)}
        ${renderMilestoneManager(detail)}
        ${buildHeatmapJS()}

        <div class="project-bento">
            ${buildHeatmapPlaceholder()}

            <div class="cm-glass-card">
                <h3 style="margin:0 0 14px;font-size:17px;font-weight:800;">${projectCopy('当前阶段', 'Current Sprint')}</h3>
                <div style="display:flex;gap:8px;margin-bottom:14px;">
                    <span style="font-size:13px;font-weight:700;color:var(--on-surface);">${requirements.length} ${projectCopy('个任务', 'tasks')}</span>
                    <span style="font-size:13px;color:var(--outline);">${openReqs} ${projectCopy('未完成', 'open')}</span>
                </div>
                ${requirements.slice(0, 6).map((r) => {
                    const done = r.status === 'done';
                    const prio = (r.priority || 'medium').toLowerCase();
                    return `
                        <div class="sprint-task${done ? ' done' : ''}">
                            <div class="sprint-task-icon">${done ? '<span class="material-symbols-outlined" style="font-size:12px;">check</span>' : ''}</div>
                            <div class="sprint-task-info">
                                <div class="sprint-task-title">${escapeHtml(r.title || projectCopy('未命名', 'Untitled'))}</div>
                                <div class="sprint-task-meta">
                                    <span>${escapeHtml(r.assignee || 'Unassigned')}</span>
                                    ${r.due_date ? `<span>Due ${escapeHtml(r.due_date)}</span>` : ''}
                                </div>
                            </div>
                            <span class="sprint-task-priority ${prio}">${priorityLabel(r.priority)}</span>
                        </div>
                    `;
                }).join('') || `<p style="font-size:13px;color:var(--outline);padding:12px 0;">${projectCopy('暂无任务', 'No tasks yet')}</p>`}
                <div class="sprint-add-task" onclick="switchView('issues')">+ ${projectCopy('添加任务', 'Add task')}</div>
            </div>

            <div class="cm-glass-card project-bento-full">
                <h3 style="margin:0 0 14px;font-size:17px;font-weight:800;">${projectCopy('汇总', 'Summary')}</h3>
                <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:28px;">
                    <div style="text-align:center;flex:1;min-width:80px;">
                        <div style="font-size:28px;font-weight:800;color:var(--primary);">${members.length}</div>
                        <div style="font-size:12px;color:var(--on-surface-variant);font-weight:700;">${projectCopy('成员', 'Members')}</div>
                    </div>
                    <div style="text-align:center;flex:1;min-width:80px;">
                        <div style="font-size:28px;font-weight:800;color:var(--primary);">${openReqs}</div>
                        <div style="font-size:12px;color:var(--on-surface-variant);font-weight:700;">${projectCopy('未完成需求', 'Open Requirements')}</div>
                    </div>
                    <div style="text-align:center;flex:1;min-width:80px;">
                        <div style="font-size:28px;font-weight:800;color:var(--primary);">${openPosts}</div>
                        <div style="font-size:12px;color:var(--on-surface-variant);font-weight:700;">${projectCopy('未完成帖子', 'Open Posts')}</div>
                    </div>
                </div>
                <h4 style="margin:0 0 8px;font-size:14px;font-weight:800;cursor:pointer;padding:8px 10px;border-radius:6px;transition:background 0.15s ease,color 0.15s ease;"
                    onclick="switchView('checkins')"
                    onmouseover="this.style.background='var(--surface-container-low)';this.style.color='var(--primary)';"
                    onmouseout="this.style.background='transparent';this.style.color='';">
                    ${projectCopy('最近打卡', 'Recent Check-ins')} <span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;">arrow_forward</span>
                </h4>
                <div style="max-height:160px;overflow:auto;">
                    ${(detail.checkins || []).slice(0, 5).map((c) => `
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px dashed rgba(194,198,214,0.3);font-size:13px;">
                            <span style="font-weight:700;color:var(--on-surface);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">${escapeHtml(c.user_name || '?')}</span>
                            <span style="color:var(--on-surface-variant);margin:0 12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:2;">${escapeHtml(c.progress_note || '')}</span>
                            <span style="font-size:11px;color:var(--outline);flex-shrink:0;">${formatTime(c.created_at)}</span>
                        </div>
                    `).join('') || `<p style="font-size:12px;color:var(--outline);">${projectCopy('暂无打卡', 'No check-ins yet')}</p>`}
                </div>
            </div>
        </div>

        ${detail.canManage ? `
        <div class="cm-glass-card" style="margin-top:20px;">
            <h3 style="margin:0 0 12px;font-size:17px;font-weight:800;">${projectCopy('操作', 'Actions')}</h3>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button onclick="changeProjectStatus('recruiting')" class="cm-button ghost">${projectCopy('设为招募中', 'Set Recruiting')}</button>
                <button onclick="changeProjectStatus('executing')" class="cm-button">${projectCopy('开始执行', 'Start Execution')}</button>
                <button onclick="changeProjectStatus('completed')" class="cm-button secondary">${projectCopy('完成项目', 'Complete')}</button>
            </div>
        </div>` : ''}

        ${project.status === 'completed' ? renderRatingBoard(detail) : ''}
    `;
}

/* ── Issues/Requirements View ── */
function renderIssues(detail) {
    const { requirements, members, canManage } = detail;
    return `
        <div style="margin-bottom:18px;">
            <p class="cm-eyebrow">${projectCopy('需求', 'Requirements')}</p>
            <h2>${projectCopy('任务管理', 'Task Management')}</h2>
        </div>
        ${canManage ? `
        <div class="cm-glass-card" style="margin-bottom:18px;">
            <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">${projectCopy('新需求', 'New Requirement')}</h3>
            <div class="issue-compose-grid">
                <div class="field-stack">
                    <input id="new-req-title" type="text" placeholder="${projectCopy('标题', 'Title')}">
                    <textarea id="new-req-desc" rows="2" placeholder="${projectCopy('描述', 'Description')}"></textarea>
                </div>
                <div class="field-stack">
                    <select id="new-req-priority"><option value="medium">${projectCopy('中', 'Medium')}</option><option value="high">${projectCopy('高', 'High')}</option><option value="low">${projectCopy('低', 'Low')}</option></select>
                    <input id="new-req-assignee" type="text" placeholder="${projectCopy('负责人姓名', 'Assignee name')}">
                    <button class="issue-submit-btn" onclick="createRequirement()">${projectCopy('创建', 'Create')}</button>
                </div>
            </div>
        </div>` : ''}
        <div class="cm-glass-card">
            <h3 style="margin:0 0 14px;font-size:16px;font-weight:800;">${projectCopy('全部需求', 'All Requirements')} (${requirements.length})</h3>
            ${requirements.map((r) => `
                <div class="issue-card">
                    <div class="issue-card-head">
                        <div>
                            <strong>${escapeHtml(r.title)}</strong>
                            <p style="font-size:12px;color:var(--outline);margin:2px 0 0;">${statusLabel(r.status)} · ${priorityLabel(r.priority)} · ${escapeHtml(r.assignee || 'Unassigned')}</p>
                        </div>
                        <span class="cm-chip">${priorityLabel(r.priority)}</span>
                    </div>
                    <p style="font-size:13px;color:var(--on-surface-variant);">${escapeHtml(r.description || '')}</p>
                    ${canManage ? `
                    <div style="display:flex;gap:8px;margin-top:10px;">
                        ${r.status !== 'done' ? `<button class="cm-button ghost" style="font-size:12px;min-height:32px;" onclick="updateRequirementStatus(${r.id},'done')">${projectCopy('标记完成', 'Mark Done')}</button>` : ''}
                        ${r.status !== 'in_progress' && r.status !== 'done' ? `<button class="cm-button ghost" style="font-size:12px;min-height:32px;" onclick="updateRequirementStatus(${r.id},'in_progress')">${projectCopy('开始', 'Start')}</button>` : ''}
                    </div>` : ''}
                </div>
            `).join('') || `<p class="team-empty">${projectCopy('暂无需求', 'No requirements')}</p>`}
        </div>
    `;
}

/* ── Members View ── */
function renderMembers(detail) {
    const { members, canManage } = detail;
    const leader = members.find((m) => m.role === 'leader');
    const others = members.filter((m) => m.role !== 'leader');
    return `
        <div style="margin-bottom:18px;">
            <p class="cm-eyebrow">${projectCopy('团队', 'Team')}</p>
            <h2>${projectCopy('成员', 'Members')} (${members.length})</h2>
        </div>
        ${canManage ? `
        <div class="cm-glass-card" style="margin-bottom:18px;">
            <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">${projectCopy('添加成员', 'Add Member')}</h3>
            <div class="member-compose">
                <input id="new-member-name" type="text" placeholder="${projectCopy('用户名', 'Username')}">
                <select id="new-member-role"><option value="core_member">${projectCopy('核心成员', 'Core Member')}</option><option value="member">${projectCopy('成员', 'Member')}</option></select>
                <button onclick="addMember()">${projectCopy('添加', 'Add')}</button>
            </div>
        </div>` : ''}
        <div class="cm-glass-card">
            ${leader ? `
            <div class="member-card" style="border:1px solid rgba(0,88,190,0.2);background:var(--primary-container);">
                <div style="display:flex;align-items:center;gap:12px;">
                    ${leader.avatar
                        ? `<span class="cm-avatar-sm" data-avatar-loaded="1" style="background:var(--primary);color:var(--on-primary);"><img data-avatar-image="1" alt="" referrerpolicy="no-referrer" src="${escapeHtml(leader.avatar)}"></span>`
                        : `<span class="cm-avatar-sm" data-user="${encodeURIComponent(leader.user_name || '')}" style="background:var(--primary);color:var(--on-primary);">${(leader.user_name||'?')[0].toUpperCase()}</span>`}
                    <div>
                        <a href="profile.html?user=${encodeURIComponent(leader.user_name || '')}" style="color:var(--on-primary-container);text-decoration:none;font-weight:800;">${escapeHtml(leader.user_name)}</a>
                        <span class="cm-chip" style="margin-left:8px;">${projectCopy('负责人', 'Leader')}</span>
                    </div>
                </div>
            </div>` : ''}
            ${others.map((m) => {
                const isSelf = m.user_name === currentUser;
                const nameEscaped = escapeHtml(m.user_name);
                let buttons = '';
                if (canManage && m.role !== 'leader') {
                    buttons += '<button class="cm-button ghost" style="font-size:11px;min-height:28px;margin-left:auto;" onclick="removeMember(&quot;' + nameEscaped + '&quot;)">Remove</button>';
                }
                if (isSelf && m.role !== 'leader') {
                    buttons += '<button class="cm-button ghost" style="font-size:11px;min-height:28px;margin-left:auto;color:var(--error);" onclick="openExitRequest()">Apply to Leave</button>';
                }
                return ['<div class="member-card">',
                    '<div style="display:flex;align-items:center;gap:12px;">',
                    m.avatar
                        ? '<span class="cm-avatar-sm" data-avatar-loaded="1"><img data-avatar-image="1" alt="" referrerpolicy="no-referrer" src="' + escapeHtml(m.avatar) + '"></span>'
                        : '<span class="cm-avatar-sm" data-user="' + encodeURIComponent(m.user_name || '') + '">' + (m.user_name||'?')[0].toUpperCase() + '</span>',
                    '<div><a href="profile.html?user=' + encodeURIComponent(m.user_name || '') + '" style="color:var(--on-surface);text-decoration:none;font-weight:700;">' + nameEscaped + '</a>',
                    '<span style="font-size:12px;color:var(--outline);margin-left:8px;">' + (m.role === 'core_member' ? projectCopy('核心成员', 'Core Member') : projectCopy('成员', 'Member')) + '</span></div>',
                    buttons,
                    '</div></div>'
                ].join('');
            }).join('')}
            ${!members.length ? `<p class="team-empty">${projectCopy('暂无成员', 'No members')}</p>` : ''}
        </div>
        ${canManage ? `<div id="exit-requests-section" style="margin-top:16px;"></div>` : ''}
        <div id="exit-request-modal" style="display:none;position:fixed;inset:0;z-index:200;background:rgba(18,28,42,0.4);align-items:center;justify-content:center;" onclick="if(event.target===this)closeExitRequest()">
            <div style="width:min(400px,94vw);background:rgba(255,255,255,0.98);border-radius:16px;padding:24px;">
                <h3 style="margin:0 0 16px;">${projectCopy('申请退出项目', 'Apply to Leave Project')}</h3>
                <p style="font-size:13px;color:var(--on-surface-variant);margin-bottom:12px;">${projectCopy('退出后负责人将对你进行评价（1-5分），评价结果将录入互评系统。', 'After leaving, the leader will rate you (1-5) and the result will be recorded.')}</p>
                <div class="field-stack">
                    <label class="form-label">${projectCopy('原因（可选）', 'Reason (optional)')}</label>
                    <textarea id="exit-reason" rows="2" placeholder="${projectCopy('你为什么要退出？', 'Why are you leaving?')}"></textarea>
                    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;">
                        <button class="cm-button ghost" onclick="closeExitRequest()">${projectCopy('取消', 'Cancel')}</button>
                        <button class="cm-button" style="background:var(--error);color:#fff;" onclick="submitExitRequest()">${projectCopy('提交', 'Submit')}</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/* ── Activity/Collaboration View ── */
function renderActivity(detail) {
    const { feedback, canManage, feedbackCanManage } = detail;
    return `
        <div style="margin-bottom:18px;">
            <p class="cm-eyebrow">${projectCopy('协作', 'Collaboration')}</p>
            <h2>${projectCopy('帖子', 'Posts')} (${feedback.length})</h2>
        </div>

        <div class="cm-glass-card" style="margin-bottom:18px;">
            <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">${projectCopy('新帖子', 'New Post')}</h3>
            <div class="field-stack">
                <label class="form-label">${projectCopy('标签', 'Tags')}</label>
                <div id="collab-label-picker" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;"></div>

                <label class="form-label" for="collab-title">${projectCopy('标题', 'Title')}</label>
                <input id="collab-title" type="text" placeholder="${projectCopy('例如：寻找前端搭档', 'e.g., Looking for a frontend partner')}">

                <label class="form-label" for="collab-body">${projectCopy('详情', 'Details')}</label>
                <textarea id="collab-body" rows="4" placeholder="${projectCopy('描述你在做什么，以及希望找到什么样的人...', 'Describe what you are working on and who you are looking for...')}"></textarea>

                <div class="publish-checkboxes">
                    <label class="checkbox-disabled"><input type="checkbox" id="collab-requires-management" checked disabled> ${projectCopy('项目管理', 'Project management')} <span style="font-size:11px;color:var(--outline);">${projectCopy('（自动开启）', '(auto-enabled)')}</span></label>
                    <label><input type="checkbox" id="collab-compensation" onchange="toggleCollabAmount()"> ${projectCopy('报酬', 'Compensation')}</label>
                    <input type="text" id="collab-amount" placeholder="${projectCopy('金额', 'Amount')}" style="max-width:120px; display:none;">
                    <label><input type="checkbox" id="collab-cross-campus"> ${projectCopy('跨校区', 'Cross-campus')}</label>
                </div>

                <div style="display:flex; justify-content:flex-end; gap:8px;">
                    <input id="collab-target" type="text" placeholder="${projectCopy('目标用户（可选）', 'Target user (optional)')}" style="max-width:200px;">
                    <button class="btn-publish" onclick="createFeedback()">
                        <span class="material-symbols-outlined">send</span> Publish
                    </button>
                </div>
            </div>
        </div>

        <div class="cm-glass-card">
            <h3 style="margin:0 0 14px;font-size:16px;font-weight:800;">${projectCopy('最近帖子', 'Recent Posts')}</h3>
            ${feedback.map((f) => `
                <div class="feedback-card">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
                        <strong>${escapeHtml(f.author || 'Unknown')}</strong>
                        <span class="cm-chip" style="font-size:10px;">${f.status === 'resolved' ? projectCopy('已解决', 'Resolved') : projectCopy('进行中', 'Open')}</span>
                    </div>
                    <p style="font-size:13px;color:var(--on-surface-variant);line-height:1.6;">${escapeHtml(f.content || '')}</p>
                    <div style="font-size:11px;color:var(--outline);margin-top:8px;">${formatTime(f.created_at)}${f.target_user ? ' · To: ' + escapeHtml(f.target_user) : ''}</div>
                    ${(canManage || feedbackCanManage) && f.status !== 'resolved' ? `
                    <button class="cm-button ghost" style="font-size:11px;min-height:28px;margin-top:8px;" onclick="resolveFeedback(${f.id})">${projectCopy('解决', 'Resolve')}</button>` : ''}
                </div>
            `).join('') || `<p class="team-empty">${projectCopy('暂无协作帖子', 'No collaboration posts')}</p>`}
        </div>
    `;
}

function toggleCollabAmount() {
    const checked = document.getElementById('collab-compensation')?.checked;
    const amount = document.getElementById('collab-amount');
    if (amount) amount.style.display = checked ? '' : 'none';
}

/* ── Check-ins View ── */
function renderCheckins(detail) {
    const { checkins, canManage } = detail;
    return `
        <div style="margin-bottom:18px;">
            <p class="cm-eyebrow">${projectCopy('打卡', 'Check-ins')}</p>
            <h2>${projectCopy('进度', 'Progress')} (${checkins.length})</h2>
        </div>
        <div class="cm-glass-card" style="margin-bottom:18px;">
            <h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">${projectCopy('新打卡', 'New Check-in')}</h3>
            <div class="field-stack">
                <textarea id="checkin-note" rows="2" placeholder="${projectCopy('今天完成了什么？', 'What did you accomplish?')}"></textarea>
                <div style="display:flex;justify-content:flex-end;">
                    <button onclick="submitCheckin()">${projectCopy('提交', 'Submit')}</button>
                </div>
            </div>
        </div>
        <div class="cm-glass-card">
            ${checkins.map((c) => `
                <div class="checkin-card">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:6px;">
                        <strong>${escapeHtml(c.user_name || 'Unknown')}</strong>
                        <span style="font-size:12px;color:var(--outline);">${formatTime(c.created_at)}</span>
                    </div>
                    <p style="font-size:13px;color:var(--on-surface-variant);">${escapeHtml(c.progress_note || '')}</p>
                </div>
            `).join('') || `<p class="team-empty">${projectCopy('暂无打卡', 'No check-ins')}</p>`}
        </div>
    `;
}

/* ── Rating Board ── */
function starRatingHTML(current) {
    let html = '<div style="display:flex;gap:4px;align-items:center;">';
    for (let i = 1; i <= 5; i++) {
        const filled = i <= current;
        html += `<span class="material-symbols-outlined" style="font-size:22px;cursor:pointer;color:${filled ? 'var(--warning)' : 'var(--outline-variant)'};" onclick="setRatingStar(${i})">${filled ? 'star' : 'star'}</span>`;
    }
    html += '</div>';
    return html;
}

function renderRatingBoard(detail) {
    const { project, members, scoreboard } = detail;
    const starHtml = (score) => {
        let h = '';
        for (let i = 1; i <= 5; i++) h += `<span style="color:${i <= Math.round(score/20) ? 'var(--warning)' : 'var(--outline-variant)'};font-size:14px;">★</span>`;
        return h;
    };
    return `
        <div class="cm-glass-card" style="margin-top:20px;">
            <h3 style="margin:0 0 14px;font-size:17px;font-weight:800;">${projectCopy('项目评分', 'Project Ratings')}</h3>
            ${scoreboard && scoreboard.length ? `
                <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
                    ${scoreboard.map((s) => `
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;background:var(--surface-container-low);border-radius:8px;">
                            <span style="font-weight:700;font-size:13px;">${escapeHtml(s.user_name)}</span>
                            <span style="font-size:13px;">${starHtml(s.final_score || s.subjective_score || 0)}</span>
                            <span style="font-weight:700;color:var(--primary);font-size:14px;">${s.final_score != null ? Number(s.final_score).toFixed(1) : '-'}</span>
                            <span style="font-size:11px;color:var(--outline);">${s.subjective_count || 0} reviews</span>
                        </div>
                    `).join('')}
                </div>` : `<p class="team-empty">${projectCopy('暂无评分', 'No ratings yet')}</p>`}
            ${members.length > 1 ? `
            <div style="border-top:1px solid rgba(194,198,214,0.3);padding-top:14px;">
                <h4 style="font-size:14px;font-weight:800;margin-bottom:8px;">${projectCopy('提交互评', 'Submit Peer Review')}</h4>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <select id="rating-reviewee" style="max-width:160px;min-height:38px;">
                        <option value="">${projectCopy('选择成员', 'Select member')}</option>
                        ${members.filter((m) => m.user_name !== currentUser).map((m) => `<option value="${escapeHtml(m.user_name)}">${escapeHtml(m.user_name)}</option>`).join('')}
                    </select>
                    <div id="rating-stars">${starRatingHTML(0)}</div>
                    <input id="rating-comment" type="text" placeholder="${projectCopy('评论', 'Comment')}" style="flex:1;min-width:140px;">
                    <button onclick="submitRating()">${projectCopy('提交', 'Submit')}</button>
                </div>
            </div>` : ''}
        </div>
    `;
}

function setRatingStar(n) {
    window._ratingValue = n;
    document.getElementById('rating-stars').innerHTML = starRatingHTML(n);
}

/* ── Milestone Operations ── */
async function createMilestone() {
    if (!state.activeProjectId) return;
    const title = document.getElementById('new-ms-title')?.value?.trim();
    const dueDate = document.getElementById('new-ms-date')?.value || '';
    if (!title) return alert(projectCopy('请输入里程碑标题', 'Milestone title required'));
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/milestones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, title, due_date: dueDate })
        });
        const json = await resp.json();
        if (json.success) {
            document.getElementById('new-ms-title').value = '';
            document.getElementById('new-ms-date').value = '';
            loadProjectDetail(state.activeProjectId);
        } else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function toggleMilestone(mid, newStatus) {
    if (!state.activeProjectId) return;
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/milestones/${mid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status: newStatus })
        });
        const json = await resp.json();
        if (json.success) loadProjectDetail(state.activeProjectId);
        else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function deleteMilestone(mid) {
    if (!state.activeProjectId || !confirm(projectCopy('删除这个里程碑？', 'Delete this milestone?'))) return;
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/milestones/${mid}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser })
        });
        const json = await resp.json();
        if (json.success) loadProjectDetail(state.activeProjectId);
        else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

/* ── API Operations ── */
async function changeProjectStatus(status) {
    if (!state.activeProjectId) return;
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status })
        });
        const json = await resp.json();
        if (json.success) { loadProjects(); loadProjectDetail(state.activeProjectId); }
        else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function createRequirement() {
    if (!state.activeProjectId) return;
    const title = document.getElementById('new-req-title')?.value?.trim();
    const desc = document.getElementById('new-req-desc')?.value?.trim();
    const priority = document.getElementById('new-req-priority')?.value || 'medium';
    const assignee = document.getElementById('new-req-assignee')?.value?.trim();
    if (!title) return alert(projectCopy('请输入标题', 'Title required'));
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/requirements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, title, description: desc, priority, assignee })
        });
        const json = await resp.json();
        if (json.success) {
            document.getElementById('new-req-title').value = '';
            document.getElementById('new-req-desc').value = '';
            loadProjectDetail(state.activeProjectId);
        } else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function updateRequirementStatus(rid, status) {
    if (!state.activeProjectId) return;
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/requirements/${rid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status })
        });
        const json = await resp.json();
        if (json.success) loadProjectDetail(state.activeProjectId);
        else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function addMember() {
    if (!state.activeProjectId) return;
    const name = document.getElementById('new-member-name')?.value?.trim();
    const role = document.getElementById('new-member-role')?.value || 'member';
    if (!name) return alert(projectCopy('请输入用户名', 'Username required'));
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, user_name: name, role })
        });
        const json = await resp.json();
        if (json.success) {
            document.getElementById('new-member-name').value = '';
            loadProjectDetail(state.activeProjectId);
        } else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function removeMember(memberName) {
    if (!state.activeProjectId || !confirm(projectCopy('移除 ', 'Remove ') + memberName + projectCopy('？', '?'))) return;
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/members/${encodeURIComponent(memberName)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser })
        });
        const json = await resp.json();
        if (json.success) loadProjectDetail(state.activeProjectId);
        else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function createFeedback() {
    if (!state.activeProjectId) return;
    const title = document.getElementById('collab-title')?.value?.trim();
    const body = document.getElementById('collab-body')?.value?.trim();
    const target = document.getElementById('collab-target')?.value?.trim();
    const requiresMgmt = document.getElementById('collab-requires-management')?.checked;
    const compensation = document.getElementById('collab-compensation')?.checked;
    const crossCampus = document.getElementById('collab-cross-campus')?.checked;
    const amount = document.getElementById('collab-amount')?.value?.trim();
    const label = state._collabLabel || '';

    if (!title || !body) return alert(projectCopy('标题和内容不能为空', 'Title and content required'));

    let finalLabel = label;
    if (label === '自定义') {
        const customText = (document.getElementById('collab-custom-label')?.value || '').trim();
        finalLabel = customText || label;
    }

    let fullContent = title + '\n\n' + body;
    if (finalLabel) fullContent = '[' + finalLabel + '] ' + fullContent;
    if (requiresMgmt) fullContent += '\n[项目管理]';
    if (compensation) fullContent += '\n[报酬: ' + (amount || '面议') + ']';
    if (crossCampus) fullContent += '\n[跨校区]';
    if (target) fullContent += '\n[目标人选: ' + target + ']';

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, content: fullContent, target_user: target || null, category: 'discussion' })
        });
        const json = await resp.json();
        if (json.success) {
            document.getElementById('collab-title').value = '';
            document.getElementById('collab-body').value = '';
            state._collabLabel = null;
            loadProjectDetail(state.activeProjectId);
        } else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function resolveFeedback(fid) {
    if (!state.activeProjectId) return;
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/feedback/${fid}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status: 'resolved' })
        });
        const json = await resp.json();
        if (json.success) loadProjectDetail(state.activeProjectId);
        else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function submitCheckin() {
    if (!state.activeProjectId) return;
    const note = document.getElementById('checkin-note')?.value?.trim();
    if (!note) return alert(projectCopy('请输入打卡内容', 'Note required'));
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/checkins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser, progress_note: note })
        });
        const json = await resp.json();
        if (json.success) {
            document.getElementById('checkin-note').value = '';
            loadProjectDetail(state.activeProjectId);
        } else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

async function submitRating() {
    if (!state.activeProjectId) return;
    const reviewee = document.getElementById('rating-reviewee')?.value?.trim();
    const comment = document.getElementById('rating-comment')?.value?.trim();
    const score = window._ratingValue || 0;
    if (!reviewee) return alert(projectCopy('请选择要评价的成员', 'Select a member to review'));
    if (!score) return alert(projectCopy('请选择星级评分', 'Select a star rating'));
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${state.activeProjectId}/ratings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewer: currentUser, reviewee, score, comment })
        });
        const json = await resp.json();
        if (json.success) {
            document.getElementById('rating-comment').value = '';
            window._ratingValue = 0;
            document.getElementById('rating-stars').innerHTML = starRatingHTML(0);
            loadProjectDetail(state.activeProjectId);
        } else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}

/* ── Exit Request (成员申请退出) ── */
function openExitRequest() {
    document.getElementById('exit-request-modal').style.display = 'flex';
}
function closeExitRequest() {
    document.getElementById('exit-request-modal').style.display = 'none';
}
async function submitExitRequest() {
    const reason = document.getElementById('exit-reason')?.value?.trim() || '';
    try {
        const resp = await fetch('http://localhost:3000/api/projects/' + state.activeProjectId + '/exit-requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser, reason })
        });
        const json = await resp.json();
        if (json.success) {
            closeExitRequest();
            alert(json.message);
            loadProjectDetail(state.activeProjectId);
        } else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}
async function loadExitRequests() {
    const container = document.getElementById('exit-requests-section');
    if (!container) return;
    try {
        const resp = await fetch('http://localhost:3000/api/projects/' + state.activeProjectId + '/exit-requests');
        const json = await resp.json();
        if (!json.success || !json.data.length) { container.innerHTML = ''; return; }
        const pending = json.data.filter(r => r.status === 'pending');
        if (!pending.length) { container.innerHTML = ''; return; }
        var items = '';
        for (var i = 0; i < pending.length; i++) {
            var r = pending[i];
            items += '<div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid rgba(194,198,214,.15);">';
            items += '<strong>' + escapeHtml(r.user_name) + '</strong>';
            items += '<span style="font-size:12px;color:var(--on-surface-variant);">' + escapeHtml(r.reason || '') + '</span>';
                items += '<button class="cm-button" style="font-size:11px;min-height:24px;margin-left:auto;" onclick="approveExit(' + r.id + ',&quot;approve&quot;)">' + projectCopy('批准', 'Approve') + '</button>';
                items += '<button class="cm-button ghost" style="font-size:11px;min-height:24px;color:var(--error);" onclick="approveExit(' + r.id + ',&quot;reject&quot;)">' + projectCopy('拒绝', 'Reject') + '</button>';
            items += '</div>';
        }
            container.innerHTML = '<div class="cm-glass-card"><h3 style="margin:0 0 12px;font-size:16px;font-weight:800;">' + projectCopy('待处理退出申请', 'Pending Exit Requests') + '</h3>' + items + '</div>';
    } catch (_) {}
}
async function approveExit(requestId, action) {
    let rating = 3;
    if (action === 'approve') {
            const r = prompt(projectCopy('评价该成员 (1-5):', 'Rate this member (1-5):'), '3');
        rating = Math.min(5, Math.max(1, parseInt(r) || 3));
            if (!confirm(projectCopy('确认批准退出？评价: ', 'Confirm approval? Rating: ') + rating + '/5')) return;
    } else {
            if (!confirm(projectCopy('拒绝退出申请？', 'Reject exit request?'))) return;
    }
    try {
        const resp = await fetch('http://localhost:3000/api/projects/' + state.activeProjectId + '/exit-requests/' + requestId, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, action, rating: rating })
        });
        const json = await resp.json();
        if (json.success) { alert(json.message); loadProjectDetail(state.activeProjectId); }
        else alert(json.message || projectCopy('失败', 'Failed'));
    } catch (_) { alert(projectCopy('网络错误', 'Network error')); }
}
