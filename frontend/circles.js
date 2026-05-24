let circles = [];
let proposals = [];
let activeFilter = 'all';

window.onload = function () {
    if (!localStorage.getItem('currentUser')) {
        alert('Please login first');
        window.location.href = 'index.html';
        return;
    }
    loadAll();
};

function esc(v) { return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

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
    } catch (_) { document.getElementById('active-circles-grid').innerHTML = '<p class="cm-muted-message">Failed to load circles</p>'; }
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
                        <p class="circle-card-desc">${esc(c.description || 'No description')}</p>
                        <div class="circle-card-footer">
                            <span class="circle-card-activity">${c.post_count || 0} posts</span>
                            <button class="circle-join-btn" onclick="openCircle(${c.id})">View</button>
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
    } catch (_) { document.getElementById('proposals-list').innerHTML = '<p class="cm-muted-message">Failed to load proposals</p>'; }
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
    const q = (document.getElementById('circle-search')?.value || '').toLowerCase();
    let filtered = circles.filter((c) => {
        const nameOk = (c.name || '').toLowerCase().includes(q);
        const descOk = (c.description || '').toLowerCase().includes(q);
        const labelOk = (c.labels || '').toLowerCase().includes(q);
        return nameOk || descOk || labelOk;
    });
    if (activeFilter !== 'all') {
        filtered = filtered.filter((c) => getCategoryForCircle(c) === activeFilter);
    }
    if (!filtered.length) { grid.innerHTML = '<p class="cm-muted-message" style="grid-column:1/-1;">No circles found</p>'; return; }

    grid.innerHTML = filtered.map((c) => {
        const cat = getCategoryForCircle(c);
        return `
            <div class="circle-card">
                <div class="circle-card-icon">
                    <span class="material-symbols-outlined">${cat === 'Study' ? 'biotech' : cat === 'Technology' ? 'code' : cat === 'Competitions' ? 'emoji_events' : 'groups'}</span>
                </div>
                <span class="circle-card-cat">${cat.toUpperCase()}</span>
                <h3 class="circle-card-title">${esc(c.name)}</h3>
                <p class="circle-card-desc">${esc(c.description || 'No description')}</p>
                <div class="circle-card-footer">
                    <span class="circle-card-activity">${c.post_count || 0} posts</span>
                    <button class="circle-join-btn" onclick="openCircle(${c.id})">View</button>
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
    if (!proposals.length) { list.innerHTML = '<p class="cm-muted-message">No pending proposals</p>'; return; }
    list.innerHTML = proposals.map((p) => {
        const pending = p.status === 'pending';
        const canSupport = pending && !p.supported_by_me;
        const isOwner = p.proposer === user;
        const isAdminUser = user === 'Captain';
        const pct = Math.round(((p.support_count || 0) / (p.threshold || 10)) * 100);
        const statusLabel = pending ? 'Voting' : (p.status === 'approved' ? 'Active' : 'Closed');
        const left = daysLeft(p.public_until);
        const timeBadge = left !== null && left > 0
            ? `<span class="proposal-time-badge${left <= 3 ? ' urgent' : ''}">${left} Day${left !== 1 ? 's' : ''} Left</span>`
            : `<span class="proposal-time-badge expired">Expired</span>`;
        return `
            <div class="proposal-item">
                <div class="proposal-item-icon">
                    <span class="material-symbols-outlined">campaign</span>
                </div>
                <div class="proposal-item-info">
                    <div class="proposal-item-name">${esc(p.name)}</div>
                    <div class="proposal-item-by">
                        Proposed by <a href="profile.html?user=${encodeURIComponent(p.proposer || '')}" style="color:var(--primary);font-weight:700;text-decoration:none;">${esc(p.proposer || 'unknown')}</a> · ${statusLabel}
                    </div>
                    <div class="proposal-item-bar-wrap">
                        <div class="proposal-item-bar-label">${p.support_count || 0} / ${p.threshold || 10} supports</div>
                        <div class="proposal-item-bar"><div class="proposal-item-bar-fill" style="width:${Math.min(100, pct)}%;"></div></div>
                        ${timeBadge}
                    </div>
                </div>
                ${(isOwner || isAdminUser) ? `<button class="cm-button ghost" style="color:var(--error);flex-shrink:0;" onclick="deleteProposal(${p.id})">Delete</button>` : ''}
                ${canSupport ? `<button class="cm-button ghost" onclick="supportProposal(${p.id})" style="flex-shrink:0;">Support</button>` : ''}
            </div>
        `;
    }).join('');
}

async function deleteProposal(pid) {
    if (!confirm('Delete this proposal?')) return;
    const user = localStorage.getItem('currentUser');
    try {
        const resp = await fetch(`http://localhost:3000/api/circle-proposals/${pid}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user })
        });
        const json = await resp.json();
        if (json.success) loadProposals();
        else alert(json.message || 'Failed');
    } catch (_) { alert('Network error'); }
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
        else alert(json.message || 'Failed');
    } catch (_) { alert('Network error'); }
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
    if (!name || !desc) return alert('Name and description required');
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
            alert(json.message || 'Done');
        } else alert(json.message || 'Failed');
    } catch (_) { alert('Network error'); }
}
