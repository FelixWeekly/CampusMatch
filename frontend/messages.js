let messageThreads = [];
let activePeer = '';
let threadFilter = 'user'; // 'user' | 'project'

window.addEventListener('load', () => {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        alert('请先登录');
        window.location.href = 'index.html';
        return;
    }

    const search = document.getElementById('thread-search');
    if (search) search.addEventListener('input', renderThreads);

    const input = document.getElementById('message-input');
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') sendMessage();
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const targetUser = urlParams.get('user');
    const targetProject = urlParams.get('project');
    loadThreads().then(() => {
        if (targetProject) {
            const peer = 'project:' + targetProject;
            threadFilter = 'project';
            document.querySelectorAll('.messages-tabs button').forEach((b) => {
                b.classList.toggle('active', b.dataset.filter === 'project');
            });
            openConversation(peer);
        } else if (targetUser) {
            const existing = messageThreads.find((t) => t.peer === targetUser);
            if (existing) openConversation(existing.peer);
            else openConversation(targetUser);
        }
    });
});

function setThreadFilter(filter, btn) {
    threadFilter = filter;
    document.querySelectorAll('.messages-tabs button').forEach((b) => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderThreads();
    if (activePeer) {
        const peerType = String(activePeer).startsWith('project:') ? 'project' : 'user';
        if (peerType !== filter) {
            activePeer = '';
            document.getElementById('conversation-title').textContent = 'Select a chat';
            document.getElementById('conversation-status').textContent = filter === 'project' ? 'Project channels' : 'Direct messages';
            document.getElementById('conversation-history').innerHTML = '<p class="muted" style="text-align:center;">Choose a conversation from the left.</p>';
        }
    }
}

async function loadThreads() {
    const currentUser = localStorage.getItem('currentUser');
    const list = document.getElementById('thread-list');
    if (list) list.innerHTML = '<p class="muted" style="padding:18px;">Loading chats...</p>';

    try {
        const response = await fetch(`http://localhost:3000/api/message-threads?user=${encodeURIComponent(currentUser)}`);
        const data = await response.json();
        if (!data.success) {
            list.innerHTML = `<p class="muted" style="padding:18px;">${data.message || 'Unable to load chats.'}</p>`;
            return;
        }

        messageThreads = data.data || [];
        renderThreads();
        if (!activePeer) {
            const filtered = filterThreads();
            if (filtered[0]) openConversation(filtered[0].peer);
        }
    } catch (error) {
        list.innerHTML = '<p class="muted" style="padding:18px;">Network error. Please check the backend service.</p>';
    }
}

function filterThreads() {
    const query = (document.getElementById('thread-search')?.value || '').trim().toLowerCase();
    return messageThreads.filter((t) => {
        const typeOk = threadFilter === 'project' ? t.type === 'project' : t.type !== 'project';
        const label = t.peer_label || t.peer || '';
        return typeOk && String(label).toLowerCase().includes(query);
    });
}

function renderThreads() {
    const list = document.getElementById('thread-list');
    const filtered = filterThreads();

    if (!filtered.length) {
        list.innerHTML = '<p class="muted" style="padding:18px;">No chats yet.</p>';
        return;
    }

    list.innerHTML = filtered.map((thread) => {
        const activeClass = thread.peer === activePeer ? ' active' : '';
        const unread = Number(thread.unread_count || 0) > 0 ? `<span class="cm-chip">${thread.unread_count}</span>` : '';
        const displayName = thread.peer_label || thread.peer;
        const isProject = thread.type === 'project';
        const icon = isProject ? 'account_tree' : '';
        const avatarLetter = isProject ? 'P' : avatarInitial(displayName);
        const avatarNode = isProject
            ? `<span class="cm-avatar-sm" data-user="${encodeURIComponent(thread.peer || '')}">${avatarLetter}</span>`
            : (thread.peer_avatar
                ? `<span class="cm-avatar-sm" data-avatar-loaded="1"><img data-avatar-image="1" alt="" referrerpolicy="no-referrer" src="${escapeHtml(thread.peer_avatar)}"></span>`
                : `<span class="cm-avatar-sm" data-user="${encodeURIComponent(thread.peer || '')}">${avatarLetter}</span>`);

        return `
            <button class="thread-item${activeClass}" type="button" onclick="openConversation('${escapeJs(thread.peer)}')">
                ${avatarNode}
                <span class="thread-main">
                    <strong>${escapeHtml(displayName)}</strong>
                    <span>${escapeHtml(thread.last_message || 'No message preview')}</span>
                </span>
                <span class="thread-meta">${formatTime(thread.last_at)}${unread}</span>
            </button>
        `;
    }).join('');
    initAvatars();
}

async function openConversation(peer) {
    activePeer = peer;
    renderThreads();
    const isProject = String(peer).startsWith('project:');
    const displayName = isProject
        ? (messageThreads.find((t) => t.peer === peer)?.peer_label || peer)
        : peer;
    const peerThread = messageThreads.find((t) => t.peer === peer);
    const peerAvatar = !isProject && peerThread ? peerThread.peer_avatar : '';

    document.getElementById('conversation-title').textContent = displayName;
    const avContainer = document.getElementById('conversation-avatar');
    avContainer.className = 'cm-avatar-sm';
    if (peerAvatar) {
        avContainer.removeAttribute('data-user');
        avContainer.setAttribute('data-avatar-loaded', '1');
        avContainer.innerHTML = '<img data-avatar-image="1" alt="" referrerpolicy="no-referrer" src="' + escapeHtml(peerAvatar) + '">';
    } else {
        avContainer.removeAttribute('data-avatar-loaded');
        avContainer.setAttribute('data-user', encodeURIComponent(peer || ''));
        avContainer.textContent = isProject ? 'P' : avatarInitial(peer);
        initAvatars();
    }
    document.getElementById('conversation-status').textContent = isProject ? 'Project channel' : 'Direct message';

    const history = document.getElementById('conversation-history');
    history.innerHTML = '<p class="muted" style="text-align:center;">Loading conversation...</p>';

    const currentUser = localStorage.getItem('currentUser');
    try {
        const response = await fetch(`http://localhost:3000/api/conversation?user=${encodeURIComponent(currentUser)}&with=${encodeURIComponent(peer)}`);
        const data = await response.json();
        if (!data.success) {
            history.innerHTML = `<p class="muted" style="text-align:center;">${data.message || 'Unable to load conversation.'}</p>`;
            return;
        }
        renderConversation(data.data || []);
    } catch (error) {
        history.innerHTML = '<p class="muted" style="text-align:center;">Network error.</p>';
    }
}

function renderConversation(messages) {
    const currentUser = localStorage.getItem('currentUser');
    const history = document.getElementById('conversation-history');
    if (!messages.length) {
        history.innerHTML = '<p class="muted" style="text-align:center;">No messages yet. Send the first one!</p>';
        return;
    }

    history.innerHTML = messages.map((message) => {
        const mine = message.sender === currentUser;
        const avatarNode = mine ? '' : (message.sender_avatar
            ? '<span class="cm-avatar-sm" data-avatar-loaded="1"><img data-avatar-image="1" alt="" referrerpolicy="no-referrer" src="' + escapeHtml(message.sender_avatar) + '"></span>'
            : '<span class="cm-avatar-sm" data-user="' + encodeURIComponent(message.sender || '') + '">' + avatarInitial(message.sender) + '</span>');
        return [
            '<div class="message-row ' + (mine ? 'mine' : '') + '">',
            avatarNode,
            '<div>',
            '<div class="message-meta">' + escapeHtml(message.sender) + ' · ' + formatTime(message.created_at) + '</div>',
            '<div class="message-bubble">' + escapeHtml(message.message) + '</div>',
            '</div>',
            '</div>'
        ].join('');
    }).join('');
    initAvatars();
    history.scrollTop = history.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    const text = (input.value || '').trim();
    if (!text || !activePeer) return;

    const currentUser = localStorage.getItem('currentUser');
    try {
        const response = await fetch('http://localhost:3000/api/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sender: currentUser, recipient: activePeer, message: text })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || '发送失败');
        input.value = '';
        await openConversation(activePeer);
        await loadThreads();
    } catch (error) {
        alert('网络错误，发送失败');
    }
}

function avatarInitial(name) {
    return String(name || 'U').trim().slice(0, 1).toUpperCase();
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



function formatTime(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeJs(value) {
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
