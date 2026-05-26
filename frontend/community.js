window.onload = function() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        alert(communityCopy('请先登录！', 'Please log in first.'));
        window.location.href = 'index.html';
        return;
    }

    const welcome = document.getElementById('community-welcome');
    if (welcome) welcome.innerText = communityCopy('社区广场', 'Community Plaza');
    refreshCommunityData();
    loadTrendingTopics();
};

let communityCircles = [];

function communityLanguage() {
    return window.getCampusMatchLanguage ? window.getCampusMatchLanguage() : ((localStorage.getItem('campusmatch-language') || 'zh') === 'en' ? 'en' : 'zh');
}

function communityCopy(zh, en) {
    return communityLanguage() === 'en' ? en : zh;
}

function communityEscape(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
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

/* Toggle the post composer expanded form */
function toggleComposer() {
    const form = document.getElementById('community-composer-form');
    const trigger = document.getElementById('composer-trigger');
    if (!form || !trigger) return;
    const isExpanded = form.classList.contains('expanded');
    if (isExpanded) {
        form.classList.remove('expanded');
        trigger.style.display = '';
    } else {
        form.classList.add('expanded');
        trigger.style.display = 'none';
        document.getElementById('community-post-title')?.focus();
    }
}

async function refreshCommunityData() {
    await loadCircleOptions();
    await loadCommunityRecommendations();
    await loadCommunityPosts();
    await loadProjectOptions();
}

async function loadProjectOptions() {
    const currentUser = localStorage.getItem('currentUser');
    const select = document.getElementById('community-post-project');
    if (!select) return;
    try {
        const resp = await fetch(`http://localhost:3000/api/my-projects?user=${encodeURIComponent(currentUser || '')}`);
        const json = await resp.json();
        select.innerHTML = `<option value="">${communityCopy('关联项目（可选）', 'Link to project (optional)')}</option>`;
        if (json.success && json.data) {
            json.data.forEach((p) => {
                select.innerHTML += `<option value="${p.id}">${communityEscape(p.title || 'Untitled')}</option>`;
            });
        }
    } catch (_) {}
}

async function loadCircleOptions() {
    const currentUser = localStorage.getItem('currentUser');
    const postCircleSelect = document.getElementById('community-post-circle');
    if (!postCircleSelect) return;

    try {
        const response = await fetch(`http://localhost:3000/api/circles?user=${encodeURIComponent(currentUser || '')}`);
        const data = await response.json();
        if (data.success) {
            communityCircles = data.data || [];
            postCircleSelect.innerHTML = `<option value="">${communityCopy('直接发布', 'Post directly')}</option>`;
            communityCircles.forEach((circle) => {
                postCircleSelect.innerHTML += `<option value="${circle.id}">${communityEscape(circle.name)}</option>`;
            });
        }
    } catch (_) {}
}

async function createCommunityPost() {
    const currentUser = localStorage.getItem('currentUser');
    const circleId = document.getElementById('community-post-circle')?.value || '';
    const projectIdRaw = document.getElementById('community-post-project')?.value?.trim() || '';
    const title = document.getElementById('community-post-title')?.value?.trim() || '';
    const content = document.getElementById('community-post-content')?.value?.trim() || '';

    if (!title || !content) return alert(communityCopy('标题和内容不能为空', 'Title and content are required'));

    try {
        const response = await fetch('http://localhost:3000/api/community/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                author: currentUser,
                circle_id: circleId ? Number(circleId) : null,
                title,
                content,
                project_id: projectIdRaw ? Number(projectIdRaw) : null
            })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || communityCopy('发布失败', 'Failed to publish'));

        document.getElementById('community-post-project').value = '';
        document.getElementById('community-post-title').value = '';
        document.getElementById('community-post-content').value = '';
        toggleComposer();
        await loadCommunityRecommendations();
        await loadCommunityPosts();
        alert(communityCopy('发布成功', 'Posted successfully'));
    } catch (err) {
        alert(communityCopy('网络错误，发布失败', 'Network error. Failed to publish'));
    }
}

async function loadCommunityPosts() {
    const currentUser = localStorage.getItem('currentUser');
    const container = document.getElementById('community-posts-container');
    if (!container) return;

    container.innerHTML = `<p class="cm-muted-message">${communityCopy('正在加载社区内容...', 'Loading community content...')}</p>`;

    try {
        const query = new URLSearchParams({ user: currentUser || '', limit: '30' });
        const response = await fetch(`http://localhost:3000/api/community/posts?${query.toString()}`);
        const data = await response.json();
        if (!data.success) {
            container.innerHTML = `<p class="cm-error-message">${data.message || communityCopy('社区加载失败', 'Failed to load community content')}</p>`;
            return;
        }

        const posts = data.data || [];
        if (!posts.length) {
            container.innerHTML = `<p class="cm-muted-message">${communityCopy('还没有帖子，来分享第一条吧！', 'No posts yet. Be the first to share!')}</p>`;
            return;
        }

        const curUser = localStorage.getItem('currentUser');
        container.innerHTML = posts.map((post) => {
            const initials = (post.author || '?').charAt(0).toUpperCase();
            const liked = post.liked_by_me ? ' liked' : '';
            const isOwn = post.author === curUser;
            const avatarNode = post.author_avatar
                ? `<span class="cm-avatar-sm" data-avatar-loaded="1"><img data-avatar-image="1" alt="" referrerpolicy="no-referrer" src="${communityEscape(post.author_avatar)}"></span>`
                : `<span class="cm-avatar-sm" data-user="${encodeURIComponent(post.author || '')}">${initials}</span>`;
            const projectEmbed = post.project_id
                ? `<div class="cm-feed-card-project" onclick="window.location.href='team_management.html?project=${post.project_id}'">
                    <span class="material-symbols-outlined" style="color:var(--secondary);">account_tree</span>
                    <span style="font-size:12px;font-weight:700;">${communityCopy('关联项目', 'Linked project')}</span>
                   </div>`
                : '';

            return `
                <article class="cm-feed-card">
                    <div class="cm-feed-card-header">
                        <div class="cm-feed-card-author">
                            ${avatarNode}
                            <div class="cm-feed-card-meta">
                                <a href="profile.html?user=${encodeURIComponent(post.author || '')}" style="color:var(--on-surface);text-decoration:none;font-weight:700;">${communityEscape(post.author)}</a>
                                <span class="cm-feed-card-info">
                                    ${post.circle_name ? `${communityCopy('来自', 'From')} ${communityEscape(post.circle_name)}` : communityCopy('公开', 'Public')} · ${communityEscape(post.created_at || '')}
                                </span>
                            </div>
                        </div>
                        ${isOwn ? `<button onclick="deleteCommunityPost(${post.id})" class="cm-feed-action" style="color:var(--error);margin-left:auto;" title="${communityCopy('删除', 'Delete')}">✕</button>` : ''}
                    </div>
                    <div class="cm-feed-card-title">${communityEscape(post.title)}</div>
                    <div class="cm-feed-card-body">${communityEscape(post.content).replace(/\n/g, '<br>')}</div>
                    ${projectEmbed}
                    <div class="cm-feed-card-actions">
                        <button onclick="toggleCommunityLike(${post.id})" class="cm-feed-action${liked}">
                            <span class="material-symbols-outlined">thumb_up</span>
                            ${post.likes_count || 0}
                        </button>
                        <button onclick="toggleInlineComments(${post.id})" class="cm-feed-action">
                            <span class="material-symbols-outlined">chat_bubble</span>
                            ${post.comments_count || 0} ${communityCopy('条评论', 'comments')}
                        </button>
                    </div>
                    <div class="cm-inline-comments" id="inline-comments-${post.id}" style="display:none; border-top:1px solid rgba(194,198,214,.3); margin-top:12px; padding-top:12px;">
                        <div class="cm-inline-comments-list" id="inline-list-${post.id}"></div>
                        <div style="display:flex; gap:8px; margin-top:8px;">
                            <input id="inline-input-${post.id}" type="text" placeholder="${communityCopy('写下评论...', 'Write a comment...')}" style="flex:1; padding:6px 10px; border:1px solid rgba(194,198,214,.4); border-radius:8px; font:inherit; font-size:13px;" onkeydown="if(event.key==='Enter')submitInlineComment(${post.id})">
                            <button onclick="submitInlineComment(${post.id})" class="cm-button" style="font-size:12px; padding:6px 14px;">${communityCopy('发送', 'Send')}</button>
                        </div>
                    </div>
                </article>
            `;
        }).join('');

        posts.forEach((post) => {
            fetch(`http://localhost:3000/api/community/posts/${post.id}/view`, { method: 'PUT' }).catch(() => {});
        });
        initAvatars();
    } catch (err) {
        container.innerHTML = `<p class="cm-error-message">${communityCopy('加载社区内容时发生网络错误', 'Network error while loading community content')}</p>`;
    }
}

async function loadCommunityRecommendations() {
    const currentUser = localStorage.getItem('currentUser');
    const container = document.getElementById('community-recommendation-container');
    if (!container) return;

    container.innerHTML = `<span class="cm-muted-message">${communityCopy('计算中...', 'Calculating...')}</span>`;

    try {
        const response = await fetch(`http://localhost:3000/api/circles/recommendations?user=${encodeURIComponent(currentUser)}&limit=3`);
        const data = await response.json();
        if (!data.success || !data.data || !data.data.length) {
            container.innerHTML = `<span class="cm-muted-message">${communityCopy('暂无圈子推荐', 'No circle recommendations yet')}</span>`;
            return;
        }

        container.innerHTML = data.data.map((circle) => {
            const tags = (circle.matched_tags || []).slice(0, 3).map(t => communityEscape(t)).join(', ');
            return `
                <div class="cm-rec-post-item" style="cursor:pointer;padding:8px 0;" onclick="window.location.href='circle.html?id=${circle.id}'">
                    <strong>${communityEscape(circle.name)}</strong>
                    <div style="font-size:12px;color:var(--on-surface-variant);">${communityEscape((circle.description || '').slice(0, 60))}</div>
                    ${tags ? `<div style="font-size:11px;color:var(--primary);margin-top:2px;">匹配: ${tags}</div>` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `<span class="cm-error-message">${communityCopy('网络错误', 'Network error')}</span>`;
    }
}

/* Trending topics from backend tag aggregation */
async function loadTrendingTopics() {
    const container = document.getElementById('community-trending-container');
    if (!container) return;

    try {
        const response = await fetch('http://localhost:3000/api/trending-topics?limit=3');
        const data = await response.json();
        if (!data.success || !data.data || !data.data.length) {
            container.innerHTML = `<p class="cm-muted-message">${communityCopy('暂无趋势', 'No trends yet')}</p>`;
            return;
        }

        const sorted = data.data;

        // 3级红色渐变：hot → warm → mild
        const heatColors = ['#dc2626', '#ef4444', '#f97316'];
        container.innerHTML = sorted.map((item, i) => `
            <div class="cm-trending-item" style="display:flex;align-items:center;gap:10px;padding:6px 0;">
                <span class="material-symbols-outlined" style="font-size:22px; color:${heatColors[i] || '#f97316'}; font-variation-settings:'FILL' 1;">local_fire_department</span>
                <span class="cm-trending-tag" style="font-weight:700; color:${heatColors[i] || '#f97316'};">${communityEscape(item.tag)}</span>
            </div>
        `).join('');
    } catch (_) {
        container.innerHTML = `<p class="cm-muted-message">${communityCopy('趋势不可用', 'Trends unavailable')}</p>`;
    }
}

async function deleteCommunityPost(postId) {
    if (!confirm(communityCopy('确定删除这条帖子吗？', 'Delete this post?'))) return;
    const currentUser = localStorage.getItem('currentUser');
    try {
        const resp = await fetch('http://localhost:3000/api/community/posts/' + postId, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser })
        });
        const data = await resp.json();
        if (data.success) loadCommunityPosts();
        else alert(data.message || communityCopy('失败', 'Failed'));
    } catch (_) { alert(communityCopy('网络错误', 'Network error')); }
}

async function toggleCommunityLike(postId) {
    const currentUser = localStorage.getItem('currentUser');
    try {
        const response = await fetch(`http://localhost:3000/api/community/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || communityCopy('点赞失败', 'Failed to like'));
        await loadCommunityPosts();
    } catch (err) {
        alert(communityCopy('网络错误，点赞失败', 'Network error. Failed to like'));
    }
}

async function toggleInlineComments(postId) {
    const container = document.getElementById('inline-comments-' + postId);
    if (!container) return;
    if (container.style.display !== 'none') {
        container.style.display = 'none';
    } else {
        container.style.display = 'block';
        await loadInlineComments(postId);
    }
}

async function loadInlineComments(postId) {
    const list = document.getElementById('inline-list-' + postId);
    if (!list) return;
    list.innerHTML = `<p class="cm-muted-message">${communityCopy('加载中...', 'Loading...')}</p>`;
    try {
        const resp = await fetch('http://localhost:3000/api/community/posts/' + postId + '/comments?limit=80');
        const data = await resp.json();
        if (!data.success) { list.innerHTML = `<p class="cm-muted-message">${communityCopy('加载失败', 'Failed to load')}</p>`; return; }
        const comments = data.data || [];
        if (!comments.length) { list.innerHTML = `<p class="cm-muted-message">${communityCopy('暂无评论', 'No comments yet')}</p>`; return; }
        list.innerHTML = comments.map(c => `
            <div style="padding:6px 0; border-bottom:1px solid rgba(194,198,214,.15);">
                <strong>${communityEscape(c.author)}</strong>
                <span style="font-size:12px;color:var(--outline);margin-left:6px;">${communityEscape(c.created_at || '')}</span>
                <div style="margin-top:2px;">${communityEscape(c.content)}</div>
            </div>
        `).join('');
    } catch (_) { list.innerHTML = `<p class="cm-muted-message">${communityCopy('加载失败', 'Failed to load')}</p>`; }
}

async function submitInlineComment(postId) {
    const currentUser = localStorage.getItem('currentUser');
    const input = document.getElementById('inline-input-' + postId);
    const content = (input?.value || '').trim();
    if (!content) return;
    try {
        const resp = await fetch('http://localhost:3000/api/community/posts/' + postId + '/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: currentUser, content })
        });
        const data = await resp.json();
        if (data.success) {
            if (input) input.value = '';
            await loadInlineComments(postId);
        } else { alert(data.message || '失败'); }
    } catch (_) { alert('网络错误'); }
}
