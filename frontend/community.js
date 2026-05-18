window.onload = function() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) {
        alert('请先登录！');
        window.location.href = 'index.html';
        return;
    }

    const welcome = document.getElementById('community-welcome');
    if (welcome) welcome.innerText = `🧭 社区广场 · ${currentUser}`;
    refreshCommunityData();
};

let communityCircles = [];
let activeCommunityCommentPostId = null;
let activeCommunityCommentPostTitle = '';

function communityEscape(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function refreshCommunityData() {
    await loadCircles();
    await loadCircleProposals();
    await loadCommunityRecommendations();
    await loadCommunityPosts();
}

async function loadCircles() {
    const currentUser = localStorage.getItem('currentUser');
    const circlesBox = document.getElementById('circles-container');
    const postCircleSelect = document.getElementById('community-post-circle');
    if (!circlesBox || !postCircleSelect) return;

    circlesBox.innerHTML = '<p style="font-size:12px; color:#9ca3af;">圈子加载中...</p>';

    try {
        const response = await fetch(`http://localhost:3000/api/circles?user=${encodeURIComponent(currentUser || '')}`);
        const data = await response.json();
        if (!data.success) {
            circlesBox.innerHTML = `<p style="font-size:12px; color:#ef4444;">${data.message || '圈子加载失败'}</p>`;
            return;
        }

        communityCircles = data.data || [];
        postCircleSelect.innerHTML = '<option value="">全站公开（不归属圈子）</option>';
        communityCircles.forEach((circle) => {
            postCircleSelect.innerHTML += `<option value="${circle.id}">${communityEscape(circle.name)}</option>`;
        });

        if (!communityCircles.length) {
            circlesBox.innerHTML = '<p style="font-size:12px; color:#9ca3af;">暂无圈子，先通过公示开一个吧。</p>';
            return;
        }

        circlesBox.innerHTML = communityCircles.map((circle) => {
            const joined = !!circle.joined;
            return `
                <div style="border:1px solid #e5e7eb; border-radius:8px; padding:8px; margin-bottom:8px; background:#f8fafc;">
                    <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start; margin-bottom:4px;">
                        <strong style="font-size:13px; color:#111827;">${communityEscape(circle.name)}</strong>
                        <span style="font-size:11px; color:#64748b;">成员 ${circle.member_count || 0}</span>
                    </div>
                    <div style="font-size:12px; color:#6b7280; margin-bottom:6px; line-height:1.5;">${communityEscape(circle.description || '暂无简介')}</div>
                    <button onclick="toggleCircleJoin(${circle.id}, ${joined ? 'true' : 'false'})" style="width:auto; padding:5px 10px; font-size:12px; background:${joined ? '#fef2f2' : '#ecfeff'}; color:${joined ? '#b91c1c' : '#155e75'}; border:1px solid ${joined ? '#fecaca' : '#a5f3fc'};">
                        ${joined ? '退出圈子' : '加入圈子'}
                    </button>
                </div>
            `;
        }).join('');
    } catch (err) {
        circlesBox.innerHTML = '<p style="font-size:12px; color:#ef4444;">网络错误，圈子加载失败</p>';
    }
}

async function loadCircleProposals() {
    const currentUser = localStorage.getItem('currentUser');
    const box = document.getElementById('circle-proposals-container');
    if (!box) return;

    box.innerHTML = '<p style="font-size:12px; color:#9ca3af;">公示加载中...</p>';

    try {
        const response = await fetch(`http://localhost:3000/api/circle-proposals?user=${encodeURIComponent(currentUser || '')}&limit=40`);
        const data = await response.json();
        if (!data.success) {
            box.innerHTML = `<p style="font-size:12px; color:#ef4444;">${data.message || '公示加载失败'}</p>`;
            return;
        }

        const proposals = data.data || [];
        if (!proposals.length) {
            box.innerHTML = '<p style="font-size:12px; color:#9ca3af;">暂无公示提案。</p>';
            return;
        }

        box.innerHTML = proposals.map((proposal) => {
            const pending = proposal.status === 'pending';
            const canSupport = pending && !proposal.supported_by_me;
            const statusText = pending ? '公示中' : (proposal.status === 'approved' ? '已开通' : (proposal.status === 'expired' ? '已过期' : '已结束'));

            return `
                <div style="border:1px solid #e5e7eb; border-radius:8px; padding:8px; margin-bottom:8px; background:#f8fafc;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; margin-bottom:4px;">
                        <strong style="font-size:13px; color:#111827;">${communityEscape(proposal.name)}</strong>
                        <span style="font-size:11px; color:${pending ? '#0f766e' : '#64748b'};">${statusText}</span>
                    </div>
                    <div style="font-size:12px; color:#6b7280; margin-bottom:6px; line-height:1.5;">${communityEscape(proposal.description)}</div>
                    <div style="font-size:11px; color:#475569; margin-bottom:6px;">支持 ${proposal.support_count || 0}/${proposal.threshold || 10}${proposal.public_until ? ` · 截止 ${communityEscape(proposal.public_until)}` : ''}</div>
                    ${canSupport ? `<button onclick="supportCircleProposal(${proposal.id})" style="width:auto; padding:5px 10px; font-size:12px; background:#ecfeff; color:#155e75; border:1px solid #a5f3fc;">支持开圈</button>` : ''}
                </div>
            `;
        }).join('');
    } catch (err) {
        box.innerHTML = '<p style="font-size:12px; color:#ef4444;">网络错误，公示加载失败</p>';
    }
}

async function createCircleProposal() {
    const currentUser = localStorage.getItem('currentUser');
    const name = document.getElementById('circle-name')?.value?.trim() || '';
    const description = document.getElementById('circle-desc')?.value?.trim() || '';
    if (!name) return alert('请输入圈子名');
    if (!description) return alert('圈子简介为必填');

    try {
        const response = await fetch('http://localhost:3000/api/circles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ creator: currentUser, name, description })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || '发起公示失败');

        document.getElementById('circle-name').value = '';
        document.getElementById('circle-desc').value = '';
        await loadCircleProposals();
        alert(data.message || '已进入公示');
    } catch (err) {
        alert('网络错误，发起公示失败');
    }
}

async function supportCircleProposal(proposalId) {
    const currentUser = localStorage.getItem('currentUser');
    try {
        const response = await fetch(`http://localhost:3000/api/circle-proposals/${proposalId}/support`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || '支持失败');

        await loadCircleProposals();
        await loadCircles();
        await loadCommunityRecommendations();
        alert(data.message || '支持成功');
    } catch (err) {
        alert('网络错误，支持失败');
    }
}

async function toggleCircleJoin(circleId, joined) {
    const currentUser = localStorage.getItem('currentUser');
    try {
        const response = await fetch(`http://localhost:3000/api/circles/${circleId}/join`, {
            method: joined ? 'DELETE' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || '操作失败');
        await loadCircles();
        await loadCommunityRecommendations();
        await loadCommunityPosts();
    } catch (err) {
        alert('网络错误，圈子操作失败');
    }
}

async function createCommunityPost() {
    const currentUser = localStorage.getItem('currentUser');
    const circleId = document.getElementById('community-post-circle')?.value || '';
    const projectIdRaw = document.getElementById('community-post-project')?.value?.trim() || '';
    const title = document.getElementById('community-post-title')?.value?.trim() || '';
    const content = document.getElementById('community-post-content')?.value?.trim() || '';

    if (!title || !content) return alert('标题和内容不能为空');

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
        if (!data.success) return alert(data.message || '发布失败');

        document.getElementById('community-post-project').value = '';
        document.getElementById('community-post-title').value = '';
        document.getElementById('community-post-content').value = '';
        await loadCommunityRecommendations();
        await loadCommunityPosts();
        alert('发布成功');
    } catch (err) {
        alert('网络错误，发布失败');
    }
}

async function loadCommunityPosts() {
    const currentUser = localStorage.getItem('currentUser');
    const container = document.getElementById('community-posts-container');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center; color:#9ca3af; padding:14px;">社区内容加载中...</p>';

    try {
        const query = new URLSearchParams({ user: currentUser || '', limit: '30' });
        const response = await fetch(`http://localhost:3000/api/community/posts?${query.toString()}`);
        const data = await response.json();
        if (!data.success) {
            container.innerHTML = `<p style="text-align:center; color:#ef4444;">${data.message || '社区加载失败'}</p>`;
            return;
        }

        const posts = data.data || [];
        if (!posts.length) {
            container.innerHTML = '<p style="text-align:center; color:#9ca3af; padding:14px;">暂无内容，发一条试试。</p>';
            return;
        }

        container.innerHTML = posts.map((post) => {
            return `
                <div class="post-card" style="padding:16px; margin-bottom:10px;">
                    <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start; margin-bottom:6px; flex-wrap:wrap;">
                        <strong style="font-size:16px; color:#111827;">${communityEscape(post.title)}</strong>
                    </div>
                    <div style="font-size:12px; color:#64748b; margin-bottom:8px;">作者 ${communityEscape(post.author)}${post.circle_name ? ` · 圈子 ${communityEscape(post.circle_name)}` : ' · 全站公开'} · ${communityEscape(post.created_at || '')}</div>
                    <div style="font-size:14px; color:#374151; line-height:1.65; margin-bottom:10px;">${communityEscape(post.content).replace(/\n/g, '<br>')}</div>
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                        <div style="font-size:12px; color:#6b7280;">👍 ${post.likes_count || 0} · 💬 ${post.comments_count || 0} · 👀 ${post.views || 0}</div>
                        <div style="display:flex; gap:8px;">
                            <button onclick="toggleCommunityLike(${post.id})" style="width:auto; padding:6px 10px; font-size:12px; background:${post.liked_by_me ? '#fee2e2' : '#ecfeff'}; color:${post.liked_by_me ? '#b91c1c' : '#155e75'}; border:1px solid ${post.liked_by_me ? '#fecaca' : '#a5f3fc'};">${post.liked_by_me ? '取消点赞' : '点赞'}</button>
                            <button onclick="openCommunityComments(${post.id}, '${encodeURIComponent(String(post.title || ''))}')" style="width:auto; padding:6px 10px; font-size:12px; background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe;">评论</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        posts.forEach((post) => {
            fetch(`http://localhost:3000/api/community/posts/${post.id}/view`, { method: 'PUT' }).catch(() => {});
        });
    } catch (err) {
        container.innerHTML = '<p style="text-align:center; color:#ef4444;">网络错误，社区加载失败</p>';
    }
}

async function loadCommunityRecommendations() {
    const currentUser = localStorage.getItem('currentUser');
    const container = document.getElementById('community-recommendation-container');
    if (!container) return;

    container.innerHTML = '正在计算社区推荐...';

    try {
        const response = await fetch(`http://localhost:3000/api/community/recommendations?user=${encodeURIComponent(currentUser)}&limit=2`);
        const data = await response.json();
        if (!data.success) {
            container.innerHTML = `<span style="color:#ef4444;">${data.message || '推荐加载失败'}</span>`;
            return;
        }

        const recPosts = ((data.data && data.data.posts) ? data.data.posts : []).slice(0, 2);
        const recCircles = (data.data && data.data.circles) ? data.data.circles : [];

        const circlesHtml = recCircles.length
            ? `<div style="margin-bottom:8px;"><strong style="font-size:13px; color:#1f2937;">推荐圈子</strong><div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:6px;">${recCircles.map((circle) => `<span style="font-size:12px; background:#ecfeff; color:#155e75; padding:4px 8px; border-radius:999px;">${communityEscape(circle.name)} · ${circle.recommendation_score}</span>`).join('')}</div></div>`
            : '';

        const postsHtml = recPosts.length
            ? `<div><strong style="font-size:13px; color:#1f2937;">推荐帖子</strong><div style="margin-top:6px; display:flex; flex-direction:column; gap:6px;">${recPosts.map((post) => `<div style="font-size:12px; color:#334155;">• ${communityEscape(post.title)}${post.recommendation_reasons && post.recommendation_reasons.length ? `（${communityEscape(post.recommendation_reasons.join('，'))}）` : ''}</div>`).join('')}</div></div>`
            : '';

        container.innerHTML = circlesHtml + postsHtml || '<span style="color:#9ca3af;">暂无推荐</span>';
    } catch (err) {
        container.innerHTML = '<span style="color:#ef4444;">网络错误，推荐加载失败</span>';
    }
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
        if (!data.success) return alert(data.message || '点赞失败');
        await loadCommunityPosts();
    } catch (err) {
        alert('网络错误，点赞失败');
    }
}

async function openCommunityComments(postId, postTitle) {
    activeCommunityCommentPostId = postId;
    activeCommunityCommentPostTitle = postTitle ? decodeURIComponent(postTitle) : '';
    const panel = document.getElementById('community-comment-panel');
    const title = document.getElementById('community-comment-title');
    if (panel) panel.style.display = 'block';
    if (title) title.textContent = `评论：${String(activeCommunityCommentPostTitle).slice(0, 24)}`;
    await loadCommunityComments();
}

function closeCommunityComments() {
    activeCommunityCommentPostId = null;
    activeCommunityCommentPostTitle = '';
    const panel = document.getElementById('community-comment-panel');
    const list = document.getElementById('community-comments-list');
    const input = document.getElementById('community-comment-input');
    if (panel) panel.style.display = 'none';
    if (list) list.innerHTML = '';
    if (input) input.value = '';
}

async function loadCommunityComments() {
    const list = document.getElementById('community-comments-list');
    if (!list || !activeCommunityCommentPostId) return;
    list.innerHTML = '<p style="font-size:12px; color:#9ca3af;">评论加载中...</p>';

    try {
        const response = await fetch(`http://localhost:3000/api/community/posts/${activeCommunityCommentPostId}/comments?limit=80`);
        const data = await response.json();
        if (!data.success) {
            list.innerHTML = `<p style="font-size:12px; color:#ef4444;">${data.message || '评论加载失败'}</p>`;
            return;
        }

        const comments = data.data || [];
        if (!comments.length) {
            list.innerHTML = '<p style="font-size:12px; color:#9ca3af;">还没有评论，来抢沙发吧。</p>';
            return;
        }

        list.innerHTML = comments.map((comment) => `
            <div style="padding:6px 0; border-bottom:1px dashed #e5e7eb;">
                <div style="font-size:12px; color:#334155; margin-bottom:2px;"><strong>${communityEscape(comment.author)}</strong> · ${communityEscape(comment.created_at || '')}</div>
                <div style="font-size:13px; color:#475569; line-height:1.55;">${communityEscape(comment.content)}</div>
            </div>
        `).join('');
    } catch (err) {
        list.innerHTML = '<p style="font-size:12px; color:#ef4444;">网络错误，评论加载失败</p>';
    }
}

async function submitCommunityComment() {
    const currentUser = localStorage.getItem('currentUser');
    const input = document.getElementById('community-comment-input');
    const content = input?.value?.trim() || '';

    if (!activeCommunityCommentPostId) return alert('请先打开一条社区帖的评论区');
    if (!content) return alert('评论内容不能为空');

    try {
        const response = await fetch(`http://localhost:3000/api/community/posts/${activeCommunityCommentPostId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: currentUser, content })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || '评论失败');

        input.value = '';
        await loadCommunityComments();
        await loadCommunityPosts();
    } catch (err) {
        alert('网络错误，评论失败');
    }
}
