const currentUser = localStorage.getItem('currentUser');
const urlParams = new URLSearchParams(window.location.search);
const preferredProjectId = Number(urlParams.get('project') || 0);

let projects = [];
let activeProjectId = null;
let activeProjectDetail = null;

window.onload = function() {
    if (!currentUser) {
        alert('请先登录');
        window.location.href = 'index.html';
        return;
    }
    loadProjects();
};

function goBackDashboard() {
    window.location.href = 'dashboard.html';
}

function statusLabel(status) {
    if (status === 'recruiting') return '招募中';
    if (status === 'executing') return '执行中';
    if (status === 'completed') return '已结项';
    return status || '未知';
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function loadProjects() {
    try {
        const resp = await fetch(`http://localhost:3000/api/my-projects?user=${encodeURIComponent(currentUser)}`);
        const json = await resp.json();
        if (!json.success) return;

        projects = json.data || [];
        renderProjectList();

        if (!projects.length) {
            document.getElementById('team-main-panel').innerHTML = '<p class="team-empty">你还没有加入任何团队项目。</p>';
            return;
        }

        const preferred = projects.find((p) => p.id === preferredProjectId);
        const initial = preferred || projects[0];
        activeProjectId = initial.id;
        await loadProjectDetail(activeProjectId);
    } catch (err) {
        document.getElementById('team-main-panel').innerHTML = '<p class="team-empty">加载失败，请检查后端服务。</p>';
    }
}

function renderProjectList() {
    const box = document.getElementById('team-project-list');
    if (!box) return;

    if (!projects.length) {
        box.innerHTML = '<p class="team-empty">暂无项目</p>';
        return;
    }

    box.innerHTML = projects.map((p) => `
        <button class="team-project-item ${p.id === activeProjectId ? 'active' : ''}" onclick="switchProject(${p.id})">
            <strong>${escapeHtml(p.title)}</strong>
            <span>${statusLabel(p.status)}</span>
            <span>成员 ${p.member_count} · 里程碑 ${p.completed_milestone_count}/${p.milestone_count}</span>
        </button>
    `).join('');
}

async function switchProject(projectId) {
    activeProjectId = projectId;
    renderProjectList();
    await loadProjectDetail(projectId);
}

async function loadProjectDetail(projectId) {
    const panel = document.getElementById('team-main-panel');
    panel.innerHTML = '<p class="team-empty">正在加载项目详情...</p>';

    try {
        const [detailResp, eventResp, feedbackResp] = await Promise.all([
            fetch(`http://localhost:3000/api/projects/${projectId}/detail?user=${encodeURIComponent(currentUser)}`),
            fetch(`http://localhost:3000/api/projects/${projectId}/events?user=${encodeURIComponent(currentUser)}&limit=40`),
            fetch(`http://localhost:3000/api/projects/${projectId}/feedback?user=${encodeURIComponent(currentUser)}`)
        ]);

        const detailJson = await detailResp.json();
        const eventJson = await eventResp.json();
        const feedbackJson = await feedbackResp.json();

        if (!detailJson.success) {
            panel.innerHTML = `<p class="team-empty">${escapeHtml(detailJson.message || '加载失败')}</p>`;
            return;
        }

        activeProjectDetail = {
            ...detailJson.data,
            events: eventJson.success ? (eventJson.data || []) : [],
            feedback: feedbackJson.success ? (feedbackJson.data || []) : [],
            feedbackCanManage: feedbackJson.success ? !!feedbackJson.can_manage : false
        };

        renderMainPanel();
    } catch (err) {
        panel.innerHTML = '<p class="team-empty">网络错误，加载失败。</p>';
    }
}

function renderMainPanel() {
    const panel = document.getElementById('team-main-panel');
    const detail = activeProjectDetail;
    if (!detail) return;

    const project = detail.project;
    const members = detail.members || [];
    const milestones = detail.milestones || [];
    const checkins = detail.checkins || [];
    const scoreboard = detail.scoreboard || [];
    const events = detail.events || [];
    const feedback = detail.feedback || [];
    const canManage = detail.can_manage;
    const isOwner = project.owner === currentUser;

    const revieweeOptions = members
        .filter((m) => m.user_name !== currentUser)
        .map((m) => `<option value="${escapeHtml(m.user_name)}">${escapeHtml(m.user_name)}</option>`)
        .join('');

    panel.innerHTML = `
        <section class="team-card">
            <div class="team-card-head">
                <div>
                    <h2>${escapeHtml(project.title)}</h2>
                    <p>项目状态：${statusLabel(project.status)}</p>
                </div>
                <span class="team-status-chip">${statusLabel(project.status)}</span>
            </div>
            <div class="team-actions-row">
                ${canManage ? `
                    <button onclick="changeProjectStatus('recruiting')">设为招募</button>
                    <button onclick="changeProjectStatus('executing')">进入执行</button>
                    <button onclick="changeProjectStatus('completed')">结项</button>
                ` : '<span class="muted">仅队长可切换状态</span>'}
            </div>
            <div class="team-tags">
                ${members.map((m) => `<span>${escapeHtml(m.user_name)} · ${m.role === 'leader' ? '队长' : '成员'}</span>`).join('')}
            </div>
        </section>

        <section class="team-grid-2">
            <div class="team-card">
                <h3>里程碑管理</h3>
                <div class="team-list">
                    ${milestones.length ? milestones.map((m) => `
                        <div class="team-list-item">
                            <div>
                                <strong>${escapeHtml(m.title)}</strong>
                                <p>截止：${escapeHtml(m.due_date || '未设置')} · ${m.status === 'completed' ? '已完成' : '进行中'}</p>
                            </div>
                            ${canManage ? `<button onclick="toggleMilestone(${m.id}, '${m.status === 'completed' ? 'pending' : 'completed'}')">${m.status === 'completed' ? '重开' : '完成'}</button>` : ''}
                        </div>
                    `).join('') : '<p class="muted">暂无里程碑</p>'}
                </div>
                ${canManage ? `
                    <div class="team-form-row">
                        <input id="new-ms-title" type="text" placeholder="新增里程碑标题">
                        <input id="new-ms-date" type="date">
                        <button onclick="createMilestone()">新增</button>
                    </div>
                ` : ''}
            </div>

            <div class="team-card">
                <h3>打卡记录与删除</h3>
                <div class="team-form-row">
                    <input id="checkin-note" type="text" placeholder="今天完成了什么">
                    <input id="checkin-completion" type="number" min="0" max="100" placeholder="完成度 0-100">
                    <button onclick="submitCheckin()">打卡</button>
                </div>
                <div class="team-list">
                    ${checkins.length ? checkins.map((c) => `
                        <div class="team-list-item">
                            <div>
                                <strong>${escapeHtml(c.user_name)} · ${c.task_completion}%</strong>
                                <p>${escapeHtml(c.progress_note || '无')} · ${escapeHtml(c.created_at)}</p>
                            </div>
                            ${(canManage || c.user_name === currentUser) ? `<button class="danger" onclick="deleteCheckin(${c.id})">删除</button>` : ''}
                        </div>
                    `).join('') : '<p class="muted">暂无打卡记录</p>'}
                </div>
            </div>
        </section>

        <section class="team-grid-2">
            <div class="team-card">
                <h3>事件监督</h3>
                <div class="team-form-row">
                    <select id="event-type">
                        <option value="risk">风险</option>
                        <option value="blocker">阻塞</option>
                        <option value="change">变更</option>
                        <option value="note">普通记录</option>
                    </select>
                    <select id="event-severity">
                        <option value="low">低</option>
                        <option value="medium" selected>中</option>
                        <option value="high">高</option>
                    </select>
                </div>
                <div class="team-form-row">
                    <input id="event-title" type="text" placeholder="事件标题">
                    <input id="event-detail" type="text" placeholder="事件说明">
                    <button onclick="createEvent()">上报</button>
                </div>
                <div class="team-list">
                    ${events.length ? events.map((e) => `
                        <div class="team-list-item">
                            <div>
                                <strong>[${escapeHtml(e.severity)}] ${escapeHtml(e.title)}</strong>
                                <p>${escapeHtml(e.actor || '系统')} · ${escapeHtml(e.created_at)}</p>
                            </div>
                        </div>
                    `).join('') : '<p class="muted">暂无监督事件</p>'}
                </div>
            </div>

            <div class="team-card">
                <h3>反馈闭环</h3>
                <div class="team-form-row">
                    <input id="feedback-content" type="text" placeholder="提交反馈内容">
                    <select id="feedback-target">
                        <option value="">目标成员（可选）</option>
                        ${members.map((m) => `<option value="${escapeHtml(m.user_name)}">${escapeHtml(m.user_name)}</option>`).join('')}
                    </select>
                    <button onclick="createFeedback()">提交反馈</button>
                </div>
                <div class="team-list">
                    ${feedback.length ? feedback.map((f) => `
                        <div class="team-list-item">
                            <div>
                                <strong>${escapeHtml(f.content)}</strong>
                                <p>${escapeHtml(f.author)} -> ${escapeHtml(f.target_user || '全部')} · ${f.status === 'resolved' ? '已处理' : '待处理'}</p>
                                ${f.resolution_note ? `<p>处理说明：${escapeHtml(f.resolution_note)}</p>` : ''}
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                                ${detail.feedbackCanManage ? `<button onclick="updateFeedback(${f.id}, '${f.status === 'resolved' ? 'open' : 'resolved'}')">${f.status === 'resolved' ? '重开' : '处理完成'}</button>` : ''}
                                ${(f.author === currentUser || detail.feedbackCanManage) ? `<button class="danger" onclick="deleteFeedback(${f.id})">${f.author === currentUser ? '撤回' : '删除'}</button>` : ''}
                            </div>
                        </div>
                    `).join('') : '<p class="muted">暂无反馈</p>'}
                </div>
            </div>
        </section>

        <section class="team-card">
            <h3>结项评分看板</h3>
            <div class="team-score-wrap">
                <table class="score-table">
                    <thead>
                        <tr>
                            <th>成员</th><th>打卡率</th><th>完成度</th><th>客观分</th><th>主观分</th><th>总分</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${scoreboard.map((s) => `<tr><td>${escapeHtml(s.user_name)}</td><td>${s.checkin_rate}%</td><td>${s.task_completion_avg}%</td><td>${s.objective_score}</td><td>${s.subjective_score}</td><td>${s.final_score}</td></tr>`).join('')}
                    </tbody>
                </table>
            </div>
            ${project.status === 'completed' ? `
                <div class="team-form-row" style="margin-top:12px;">
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
            ` : '<p class="muted">项目未结项，暂不能互评。</p>'}
        </section>
        <section class="team-card" style="margin-top:18px;">
            <button class="team-leave-button" onclick="leaveProject()" ${isOwner ? 'disabled' : ''}>
                ${isOwner ? '队长无法退出项目' : '退出项目'}
            </button>
        </section>
    `;
}

async function changeProjectStatus(status) {
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '状态更新失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，状态更新失败');
    }
}

async function createMilestone() {
    const title = (document.getElementById('new-ms-title')?.value || '').trim();
    const dueDate = document.getElementById('new-ms-date')?.value || '';
    if (!title) return alert('请输入里程碑标题');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/milestones`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, title, due_date: dueDate })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '新增失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，新增失败');
    }
}

async function toggleMilestone(milestoneId, status) {
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/milestones/${milestoneId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '更新失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，更新失败');
    }
}

async function submitCheckin() {
    const note = (document.getElementById('checkin-note')?.value || '').trim();
    const completion = Number(document.getElementById('checkin-completion')?.value);

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/checkins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser, progress_note: note, task_completion: completion })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '打卡失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，打卡失败');
    }
}

async function deleteCheckin(checkinId) {
    if (!confirm('确定删除该打卡记录吗？')) return;
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/checkins/${checkinId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '删除失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，删除失败');
    }
}

async function createEvent() {
    const eventType = document.getElementById('event-type')?.value || 'note';
    const severity = document.getElementById('event-severity')?.value || 'medium';
    const title = (document.getElementById('event-title')?.value || '').trim();
    const detail = (document.getElementById('event-detail')?.value || '').trim();
    if (!title) return alert('请输入事件标题');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, event_type: eventType, title, detail, severity })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '上报失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，上报失败');
    }
}

async function createFeedback() {
    const content = (document.getElementById('feedback-content')?.value || '').trim();
    const target = document.getElementById('feedback-target')?.value || '';
    if (!content) return alert('请输入反馈内容');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, content, target_user: target, category: 'general' })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '提交失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，提交失败');
    }
}

async function updateFeedback(feedbackId, status) {
    const resolutionNote = prompt(status === 'resolved' ? '输入处理说明（可选）' : '输入复开说明（可选）') || '';

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/feedback/${feedbackId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status, resolution_note: resolutionNote })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '更新失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，更新失败');
    }
}

async function deleteFeedback(feedbackId) {
    if (!confirm('确定撤回/删除该反馈吗？')) return;

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/feedback/${feedbackId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '操作失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，操作失败');
    }
}

async function leaveProject() {
    if (!confirm('确定要退出该项目吗？退出后该项目将不再出现在“我的项目”列表中。')) return;

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/members`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '退出失败');

        alert('你已成功退出项目');
        await refreshAll();
    } catch (err) {
        alert('网络错误，退出失败');
    }
}

async function submitProjectRating() {
    const reviewee = document.getElementById('rating-reviewee')?.value;
    const score = Number(document.getElementById('rating-score')?.value || 5);
    const comment = (document.getElementById('rating-comment')?.value || '').trim();
    if (!reviewee) return alert('请选择队友');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/ratings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewer: currentUser, reviewee, score, comment })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '提交失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，提交失败');
    }
}

async function refreshAll() {
    await loadProjects();
    if (activeProjectId) {
        await loadProjectDetail(activeProjectId);
        renderProjectList();
    }
}
