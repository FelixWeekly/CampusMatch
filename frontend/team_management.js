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
    const requirements = detail.requirements || [];
    const scoreboard = detail.scoreboard || [];
    const events = detail.events || [];
    const feedback = detail.feedback || [];
    const memberChanges = detail.member_changes || [];
    const requirementChanges = detail.requirement_changes || [];
    const canManage = detail.can_manage;

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
                ${members.map((m) => `<span>${escapeHtml(m.user_name)} · ${roleLabel(m.role)}</span>`).join('')}
            </div>
        </section>

        <section class="team-grid-2">
            <div class="team-card">
                <h3>项目成员调整</h3>
                <div class="team-list">
                    ${members.length ? members.map((m) => `
                        <div class="team-list-item">
                            <div>
                                <strong>${escapeHtml(m.user_name)}</strong>
                                <p>${roleLabel(m.role)} · 加入时间 ${escapeHtml(m.joined_at || '-')}</p>
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                                ${canManage ? `
                                    <select id="member-role-${encodeURIComponent(m.user_name)}" style="width:140px;">
                                        <option value="leader" ${m.role === 'leader' ? 'selected' : ''}>负责人</option>
                                        <option value="core_member" ${m.role === 'core_member' ? 'selected' : ''}>核心成员</option>
                                        <option value="member" ${m.role === 'member' ? 'selected' : ''}>普通成员</option>
                                    </select>
                                    <button onclick="updateProjectMemberRole('${encodeURIComponent(m.user_name)}')">改角色</button>
                                    ${(m.user_name !== currentUser || m.role !== 'leader') ? `<button class="danger" onclick="removeProjectMember('${encodeURIComponent(m.user_name)}')">移出</button>` : ''}
                                ` : (m.user_name === currentUser && m.role !== 'leader' ? `<button class="danger" onclick="removeProjectMember('${encodeURIComponent(m.user_name)}')">退出项目</button>` : '')}
                            </div>
                        </div>
                    `).join('') : '<p class="muted">暂无成员</p>'}
                </div>
                ${canManage ? `
                    <div class="team-form-row">
                        <input id="new-member-name" type="text" placeholder="成员用户名">
                        <select id="new-member-role">
                            <option value="member">普通成员</option>
                            <option value="core_member">核心成员</option>
                            <option value="leader">负责人</option>
                        </select>
                        <button onclick="addProjectMember()">新增成员</button>
                    </div>
                ` : '<p class="muted">仅负责人可新增成员和调整角色。</p>'}
            </div>

            <div class="team-card">
                <h3>项目需求池（可持续发布）</h3>
                <div class="team-form-row">
                    <input id="new-req-title" type="text" placeholder="需求标题">
                    <select id="new-req-priority">
                        <option value="high">高优先级</option>
                        <option value="medium" selected>中优先级</option>
                        <option value="low">低优先级</option>
                    </select>
                </div>
                <div class="team-form-row">
                    <input id="new-req-desc" type="text" placeholder="需求描述（可选）">
                    <select id="new-req-assignee">
                        <option value="">暂不分配</option>
                        ${members.map((m) => `<option value="${escapeHtml(m.user_name)}">${escapeHtml(m.user_name)}</option>`).join('')}
                    </select>
                    <button onclick="createRequirement()">发布需求</button>
                </div>
                <div class="team-list">
                    ${requirements.length ? requirements.map((r) => `
                        <div class="team-list-item">
                            <div>
                                <strong>${escapeHtml(r.title)}</strong>
                                <p>${requirementStatusLabel(r.status)} · ${requirementPriorityLabel(r.priority)} · 指派 ${escapeHtml(r.assignee || '未分配')} · 由 ${escapeHtml(r.created_by || '系统')} 发布</p>
                                ${r.description ? `<p>${escapeHtml(r.description)}</p>` : ''}
                            </div>
                            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
                                <select id="req-status-${r.id}" style="width:120px;">
                                    <option value="open" ${r.status === 'open' ? 'selected' : ''}>待开始</option>
                                    <option value="in_progress" ${r.status === 'in_progress' ? 'selected' : ''}>进行中</option>
                                    <option value="blocked" ${r.status === 'blocked' ? 'selected' : ''}>阻塞</option>
                                    <option value="done" ${r.status === 'done' ? 'selected' : ''}>已完成</option>
                                </select>
                                <button onclick="updateRequirementStatus(${r.id})">更新状态</button>
                                ${canManage ? `
                                    <select id="req-assignee-${r.id}" style="width:130px;">
                                        <option value="">未分配</option>
                                        ${members.map((m) => `<option value="${escapeHtml(m.user_name)}" ${m.user_name === r.assignee ? 'selected' : ''}>${escapeHtml(m.user_name)}</option>`).join('')}
                                    </select>
                                    <button onclick="reassignRequirement(${r.id})">改派</button>
                                ` : ''}
                            </div>
                        </div>
                    `).join('') : '<p class="muted">暂无需求记录</p>'}
                </div>
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

        <section class="team-grid-2">
            <div class="team-card">
                <h3>成员变更历史</h3>
                <div class="team-list">
                    ${memberChanges.length ? memberChanges.map((h) => `
                        <div class="team-list-item">
                            <div>
                                <strong>${escapeHtml(h.action_type || 'change')} · ${escapeHtml(h.target_user || '-')}</strong>
                                <p>操作者 ${escapeHtml(h.actor || '系统')} · ${escapeHtml(h.from_role || '-')} -> ${escapeHtml(h.to_role || '-')}</p>
                                ${h.note ? `<p>${escapeHtml(h.note)}</p>` : ''}
                            </div>
                        </div>
                    `).join('') : '<p class="muted">暂无成员变更记录</p>'}
                </div>
            </div>
            <div class="team-card">
                <h3>需求变更历史</h3>
                <div class="team-list">
                    ${requirementChanges.length ? requirementChanges.map((h) => `
                        <div class="team-list-item">
                            <div>
                                <strong>${escapeHtml(h.action_type || 'update')} · 需求 #${escapeHtml(h.requirement_id)}</strong>
                                <p>操作者 ${escapeHtml(h.actor || '系统')} · ${escapeHtml(h.created_at || '')}</p>
                            </div>
                        </div>
                    `).join('') : '<p class="muted">暂无需求变更记录</p>'}
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

async function createRequirement() {
    const title = (document.getElementById('new-req-title')?.value || '').trim();
    const description = (document.getElementById('new-req-desc')?.value || '').trim();
    const priority = document.getElementById('new-req-priority')?.value || 'medium';
    const assignee = document.getElementById('new-req-assignee')?.value || '';
    if (!title) return alert('请输入需求标题');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/requirements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, title, description, priority, assignee })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '发布需求失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，发布需求失败');
    }
}

async function updateRequirementStatus(requirementId) {
    const status = document.getElementById(`req-status-${requirementId}`)?.value || 'open';
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/requirements/${requirementId}`, {
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

async function reassignRequirement(requirementId) {
    const assignee = document.getElementById(`req-assignee-${requirementId}`)?.value || '';
    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/requirements/${requirementId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, assignee })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '改派失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，改派失败');
    }
}

async function addProjectMember() {
    const userName = (document.getElementById('new-member-name')?.value || '').trim();
    const role = document.getElementById('new-member-role')?.value || 'member';
    if (!userName) return alert('请输入成员用户名');

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/members`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, user_name: userName, role })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '新增成员失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，新增成员失败');
    }
}

async function updateProjectMemberRole(encodedUserName) {
    const userName = decodeURIComponent(encodedUserName || '');
    const role = document.getElementById(`member-role-${encodedUserName}`)?.value || 'member';
    if (!userName) return;

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/members/${encodeURIComponent(userName)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, role })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '角色调整失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，角色调整失败');
    }
}

async function removeProjectMember(encodedUserName) {
    const userName = decodeURIComponent(encodedUserName || '');
    if (!userName) return;
    if (!confirm(`确定将 ${userName} 移出项目吗？`)) return;

    let reassignTo = '';
    const isManager = activeProjectDetail && activeProjectDetail.can_manage;
    if (isManager) {
        reassignTo = prompt('若该成员有未完成需求，可输入改派目标成员（留空则取消指派）') || '';
    }

    try {
        const resp = await fetch(`http://localhost:3000/api/projects/${activeProjectId}/members/${encodeURIComponent(userName)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, reassign_to: reassignTo.trim() })
        });
        const json = await resp.json();
        if (!json.success) return alert(json.message || '成员移除失败');
        await refreshAll();
    } catch (err) {
        alert('网络错误，成员移除失败');
    }
}

async function refreshAll() {
    await loadProjects();
    if (activeProjectId) {
        await loadProjectDetail(activeProjectId);
        renderProjectList();
    }
}
