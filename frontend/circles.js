let circles = [];
let proposals = [];
let activeFilter = 'all';

function campusMatchLanguage() {
    return window.getCampusMatchLanguage ? window.getCampusMatchLanguage() : ((localStorage.getItem('campusmatch-language') || 'zh') === 'en' ? 'en' : 'zh');
}

window.onload = function () {
    if (!localStorage.getItem('currentUser')) {
           alert(campusMatchLanguage() === 'en' ? 'Please log in first.' : '请先登录');
        window.location.href = 'index.html';
        return;
    }
    loadAll();
};

function esc(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function normalizeCircleQuery(value) {
    return String(value || '').trim().toLowerCase();
}

function buildCircleQueryTokens(query) {
    const normalized = normalizeCircleQuery(query);
    if (!normalized) return [];

    const tokens = [];
    const seen = new Set();
    const synonymMap = {
        ai: ['人工智能', '智能', '机器学习', '深度学习', '大模型'],
        人工智能: ['ai', '智能', '机器学习', '深度学习', '大模型'],
        机器学习: ['ml', 'ai', '人工智能'],
        深度学习: ['ai', '人工智能'],
        大模型: ['ai', '人工智能']
    };
    const pushToken = (token) => {
        const cleaned = String(token || '').trim().toLowerCase();
        if (!cleaned || seen.has(cleaned)) return;
        seen.add(cleaned);
        tokens.push(cleaned);
    };

    normalized.split(/\s+/).filter(Boolean).forEach(pushToken);

    normalized.split(/\s+/).filter(Boolean).forEach((token) => {
        const extras = synonymMap[token] || synonymMap[token.toLowerCase()] || [];
        extras.forEach(pushToken);
    });

    const compact = normalized.replace(/\s+/g, '');
    if (compact.length > 2 && tokens.length <= 1) {
        for (let size = 2; size <= Math.min(3, compact.length); size += 1) {
            for (let index = 0; index <= compact.length - size; index += 1) {
                pushToken(compact.slice(index, index + size));
            }
        }
    }

    return tokens;
}

function getCircleSearchHaystack(circle) {
    return [circle.name, circle.description, circle.labels, circle.category]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
}

function scoreCircleMatch(circle, query, queryTokens) {
    if (!query) return 0;

    const haystack = getCircleSearchHaystack(circle);
    const name = String(circle.name || '').toLowerCase();
    const description = String(circle.description || '').toLowerCase();
    const labels = String(circle.labels || '').toLowerCase();
    const category = String(circle.category || '').toLowerCase();

    const compactQuery = query.replace(/\s+/g, '');

    if (haystack.includes(query) || (compactQuery && haystack.includes(compactQuery))) {
        let score = 140;
        if (name.includes(query)) score += 30;
        if (compactQuery && name.includes(compactQuery)) score += 18;
        if (description.includes(query)) score += 12;
        if (compactQuery && description.includes(compactQuery)) score += 8;
        if (labels.includes(query)) score += 12;
        if (compactQuery && labels.includes(compactQuery)) score += 8;
        if (category.includes(query)) score += 8;
        if (compactQuery && category.includes(compactQuery)) score += 6;
        return score;
    }

    if (!queryTokens.length) return 0;

    let hitCount = 0;
    let weightedHits = 0;
    queryTokens.forEach((token) => {
        if (!token) return;
        if (!haystack.includes(token)) return;
        hitCount += 1;
        if (name.includes(token)) weightedHits += 4;
        else if (labels.includes(token)) weightedHits += 3;
        else if (category.includes(token)) weightedHits += 2;
        else if (description.includes(token)) weightedHits += 1;
        else weightedHits += 1;
    });

    if (!hitCount) return 0;

    const coverage = hitCount / queryTokens.length;
    if (coverage < 0.5) {
        const strongPartial = compactQuery.length > 2 && (
            name.includes(compactQuery) ||
            labels.includes(compactQuery) ||
            category.includes(compactQuery) ||
            description.includes(compactQuery)
        );
        if (!strongPartial && weightedHits < 4) return 0;
    }

    return Math.round(coverage * 60 + weightedHits * 8);
}

async function loadAll() {
    await Promise.all([loadCircles(), loadProposals(), loadRecommendations()]);
}

async function loadCircles() {
    const user = localStorage.getItem('currentUser');
    try {
        const resp = await fetch(`http://localhost:3000/api/circles?user=${encodeURIComponent(user)}`);
        const json = await resp.json();
        if (json.success) circles = json.data || [];
        renderCircles();
    } catch (_) { document.getElementById('active-circles-grid').innerHTML = `<p class="cm-muted-message">${campusMatchLanguage() === 'en' ? 'Failed to load circles' : '圈子加载失败'}</p>`; }
}

async function loadRecommendations() {
    const user = localStorage.getItem('currentUser');
    const container = document.getElementById('recommended-circles-grid');
    if (!container) return;
    try {
        const resp = await fetch(`http://localhost:3000/api/circles/recommendations?user=${encodeURIComponent(user)}&limit=4`);
        const json = await resp.json();
        if (json.success && json.data.length) {
            container.innerHTML = json.data.map((c) => {
                const cat = c.category || 'Social';
                return `
                    <div class="circle-card">
                        <div class="circle-card-icon">
                            <span class="material-symbols-outlined">${cat === 'Study' ? 'biotech' : cat === 'Technology' ? 'code' : cat === 'Competitions' ? 'emoji_events' : 'groups'}</span>
                        </div>
                        <span class="circle-card-cat">${cat.toUpperCase()}</span>
                        <h3 class="circle-card-title">${esc(c.name)}</h3>
                        <p class="circle-card-desc">${esc(c.description || (campusMatchLanguage() === 'en' ? 'No description' : '暂无简介'))}</p>
                        <div class="circle-card-footer">
                            <span class="circle-card-activity">${c.post_count || 0} ${campusMatchLanguage() === 'en' ? 'posts' : '条帖子'}</span>
                            <button class="circle-join-btn" onclick="openCircle(${c.id})">${campusMatchLanguage() === 'en' ? 'View' : '查看'}</button>
                        </div>
                    </div>
                `;
            }).join('');
            container.parentElement.style.display = '';
        } else {
            container.parentElement.style.display = 'none';
        }
    } catch (_) { if (container) container.parentElement.style.display = 'none'; }
}

async function loadProposals() {
    const user = localStorage.getItem('currentUser');
    try {
        const resp = await fetch(`http://localhost:3000/api/circle-proposals?user=${encodeURIComponent(user)}&limit=40`);
        const json = await resp.json();
        if (json.success) proposals = json.data || [];
        renderProposals();
    } catch (_) { document.getElementById('proposals-list').innerHTML = `<p class="cm-muted-message">${campusMatchLanguage() === 'en' ? 'Failed to load proposals' : '提案加载失败'}</p>`; }
}

/* Filter */
function setCircleFilter(cat, btn) {
    activeFilter = cat;
    document.querySelectorAll('.circle-filter').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderCircles();
}

function getCategoryForCircle(circle) {
    const text = ((circle.name || '') + ' ' + (circle.description || '') + ' ' + (circle.category || '')).toLowerCase();
    if (/research|研究|paper|academic/.test(text)) return 'Study';
    if (/tech|code|dev|program|ai|ml|data/.test(text)) return 'Technology';
    if (/social|社交|chat|talk|discuss|meet/.test(text)) return 'Social';
    if (/compet|比赛|hack|challenge|contest/.test(text)) return 'Competitions';
    return 'Social';
}

function renderCircles() {
    const grid = document.getElementById('active-circles-grid');
    const query = normalizeCircleQuery(document.getElementById('circle-search')?.value || '');
    const queryTokens = buildCircleQueryTokens(query);

    let filtered = circles.slice();
    if (activeFilter !== 'all') {
        filtered = filtered.filter((c) => getCategoryForCircle(c) === activeFilter);
    }

    if (query) {
        filtered = filtered
            .map((circle) => ({ circle, score: scoreCircleMatch(circle, query, queryTokens) }))
            .filter(({ score }) => score > 0)
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                const postDiff = Number(b.circle.post_count || 0) - Number(a.circle.post_count || 0);
                if (postDiff !== 0) return postDiff;
                return String(a.circle.name || '').localeCompare(String(b.circle.name || ''), 'zh-Hans-CN');
            })
            .map(({ circle }) => circle);
    }

    if (!filtered.length) { grid.innerHTML = `<p class="cm-muted-message" style="grid-column:1/-1;">${campusMatchLanguage() === 'en' ? 'No circles found' : '未找到圈子'}</p>`; return; }

    grid.innerHTML = filtered.map((c) => {
        const cat = getCategoryForCircle(c);
        return `
            <div class="circle-card">
                <div class="circle-card-icon">
                    <span class="material-symbols-outlined">${cat === 'Study' ? 'biotech' : cat === 'Technology' ? 'code' : cat === 'Competitions' ? 'emoji_events' : 'groups'}</span>
                </div>
                <span class="circle-card-cat">${cat.toUpperCase()}</span>
                <h3 class="circle-card-title">${esc(c.name)}</h3>
                <p class="circle-card-desc">${esc(c.description || (campusMatchLanguage() === 'en' ? 'No description' : '暂无简介'))}</p>
                <div class="circle-card-footer">
                    <span class="circle-card-activity">${c.post_count || 0} ${campusMatchLanguage() === 'en' ? 'posts' : '条帖子'}</span>
                    <button class="circle-join-btn" onclick="openCircle(${c.id})">${campusMatchLanguage() === 'en' ? 'View' : '查看'}</button>
                </div>
            </div>
        `;
    }).join('');
}

function openCircle(id) {
    window.location.href = `circle.html?id=${id}`;
}

function daysLeft(until) {
    if (!until) return null;
    const now = Date.now();
    const end = new Date(until).getTime();
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return diff;
}

function renderProposals() {
    const list = document.getElementById('proposals-list');
    const user = localStorage.getItem('currentUser');
    if (!proposals.length) { list.innerHTML = `<p class="cm-muted-message">${campusMatchLanguage() === 'en' ? 'No pending proposals' : '暂无待处理提案'}</p>`; return; }
    list.innerHTML = proposals.map((p) => {
        const pending = p.status === 'pending';
        const canSupport = pending && !p.supported_by_me;
        const isOwner = p.proposer === user;
        const isAdminUser = user === 'Captain';
        const pct = Math.round(((p.support_count || 0) / (p.threshold || 10)) * 100);
        const statusLabel = pending ? (campusMatchLanguage() === 'en' ? 'Voting' : '投票中') : (p.status === 'approved' ? (campusMatchLanguage() === 'en' ? 'Active' : '生效中') : (campusMatchLanguage() === 'en' ? 'Closed' : '已关闭'));
        const left = daysLeft(p.public_until);
        const timeBadge = left !== null && left > 0
            ? `<span class="proposal-time-badge${left <= 3 ? ' urgent' : ''}">${left} ${campusMatchLanguage() === 'en' ? `Day${left !== 1 ? 's' : ''} Left` : '天后结束'}</span>`
            : `<span class="proposal-time-badge expired">${campusMatchLanguage() === 'en' ? 'Expired' : '已过期'}</span>`;
        return `
            <div class="proposal-item">
                <div class="proposal-item-icon">
                    <span class="material-symbols-outlined">campaign</span>
                </div>
                <div class="proposal-item-info">
                    <div class="proposal-item-name">${esc(p.name)}</div>
                    <div class="proposal-item-by">
                        ${campusMatchLanguage() === 'en' ? 'Proposed by' : '由'} <a href="profile.html?user=${encodeURIComponent(p.proposer || '')}" style="color:var(--primary);font-weight:700;text-decoration:none;">${esc(p.proposer || (campusMatchLanguage() === 'en' ? 'unknown' : '未知'))}</a> ${campusMatchLanguage() === 'en' ? '' : '提出'} · ${statusLabel}
                    </div>
                    <div class="proposal-item-bar-wrap">
                        <div class="proposal-item-bar-label">${p.support_count || 0} / ${p.threshold || 10} ${campusMatchLanguage() === 'en' ? 'supports' : '个支持'}</div>
                        <div class="proposal-item-bar"><div class="proposal-item-bar-fill" style="width:${Math.min(100, pct)}%;"></div></div>
                        ${timeBadge}
                    </div>
                </div>
                ${(isOwner || isAdminUser) ? `<button class="cm-button ghost" style="color:var(--error);flex-shrink:0;" onclick="deleteProposal(${p.id})">${campusMatchLanguage() === 'en' ? 'Delete' : '删除'}</button>` : ''}
                ${canSupport ? `<button class="cm-button ghost" onclick="supportProposal(${p.id})" style="flex-shrink:0;">${campusMatchLanguage() === 'en' ? 'Support' : '支持'}</button>` : ''}
            </div>
        `;
    }).join('');
}

async function deleteProposal(pid) {
    if (!confirm(campusMatchLanguage() === 'en' ? 'Delete this proposal?' : '确定删除这个提案吗？')) return;
    const user = localStorage.getItem('currentUser');
    try {
        const resp = await fetch(`http://localhost:3000/api/circle-proposals/${pid}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user })
        });
        const json = await resp.json();
        if (json.success) loadProposals();
        else alert(json.message || (campusMatchLanguage() === 'en' ? 'Failed' : '失败'));
    } catch (_) { alert(campusMatchLanguage() === 'en' ? 'Network error' : '网络错误'); }
}

async function supportProposal(proposalId) {
    const user = localStorage.getItem('currentUser');
    try {
        const resp = await fetch(`http://localhost:3000/api/circle-proposals/${proposalId}/support`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user })
        });
        const json = await resp.json();
        if (json.success) { loadProposals(); loadCircles(); }
        else alert(json.message || (campusMatchLanguage() === 'en' ? 'Failed' : '失败'));
    } catch (_) { alert(campusMatchLanguage() === 'en' ? 'Network error' : '网络错误'); }
}

/* Propose modal */
function openProposeCircle() {
    document.getElementById('propose-overlay').style.display = 'flex';
}
function closeProposeCircle() {
    document.getElementById('propose-overlay').style.display = 'none';
}
async function submitProposal() {
    const user = localStorage.getItem('currentUser');
    const name = document.getElementById('propose-name')?.value?.trim();
    const desc = document.getElementById('propose-desc')?.value?.trim();
    const category = document.getElementById('propose-category')?.value || 'Social';
    if (!name || !desc) return alert(campusMatchLanguage() === 'en' ? 'Name and description required' : '名称和简介不能为空');
    try {
        const resp = await fetch('http://localhost:3000/api/circles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creator: user, name, description: desc, category })
        });
        const json = await resp.json();
        if (json.success) {
            closeProposeCircle();
            document.getElementById('propose-name').value = '';
            document.getElementById('propose-desc').value = '';
            if (json.data && json.data.is_admin_create) {
                loadCircles();
            } else {
                loadProposals();
            }
            alert(json.message || (campusMatchLanguage() === 'en' ? 'Done' : '已完成'));
        } else alert(json.message || (campusMatchLanguage() === 'en' ? 'Failed' : '失败'));
    } catch (_) { alert(campusMatchLanguage() === 'en' ? 'Network error' : '网络错误'); }
}
