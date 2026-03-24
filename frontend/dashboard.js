// 一打开这个页面，就会自动执行初始化函数
window.onload = function() {
    // 1. 检查有没有人登录？(从 localStorage 里取名字)
    const currentUser = localStorage.getItem('currentUser');
    
    // 如果没名字，说明没登录，直接一脚踢回登录页！
    if (!currentUser) {
        alert('请先登录！');
        window.location.href = 'index.html';
        return;
    }

    // 2. 把名字显示在标题上
    document.getElementById('welcome-text').innerText = `👋 欢迎, ${currentUser}!`;

    // 3. 去后端抓取所有的帖子
    fetchPosts();
};

// 退出登录
function logout() {
    localStorage.removeItem('currentUser'); // 清除记忆
    window.location.href = 'index.html';    // 跳回登录页
}

// 发布帖子功能
async function createPost() {
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    const type = document.getElementById('post-type').value;
    const author = localStorage.getItem('currentUser'); // 谁发的帖？

    if (title === '' || content === '') {
        alert('标题和内容不能为空！');
        return;
    }

    // 打包数据发送给后端
    try {
        const response = await fetch('http://localhost:3000/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author, title, content, type })
        });
        const data = await response.json();

        if (data.success) {
            alert('发布成功！');
            // 清空输入框
            document.getElementById('post-title').value = '';
            document.getElementById('post-content').value = '';
            // 重新刷新帖子列表
            fetchPosts();
        }
    } catch (error) {
        alert('网络错误，发布失败！');
    }
}

// 本地缓存所有帖子，便于过滤/排序
let allPosts = [];

// 获取并显示帖子列表
async function fetchPosts() {
    try {
        const currentUser = localStorage.getItem('currentUser');
        
        // 发送请求，带上 user 参数，让后端帮我们算“已报名”状态
        const response = await fetch(`http://localhost:3000/api/posts?user=${currentUser}`);
        const data = await response.json();

        if (data.success) {
            allPosts = data.data || [];
            // 渲染当前（可能带过滤）的帖子
            renderPosts();
        }
    } catch (error) {
        console.error("加载帖子失败", error);
        // 如果出错，在页面上显示红色错误提示，而不是一直转圈
        document.getElementById('posts-container').innerHTML = '<p style="color: red; text-align: center;">加载失败，请检查后端服务器是否启动！</p>';
    }
}

// 渲染帖子（会应用当前过滤器和排序）
function renderPosts() {
    const postsContainer = document.getElementById('posts-container');
    postsContainer.innerHTML = '';

    if (!allPosts || allPosts.length === 0) {
        postsContainer.innerHTML = '<p style="text-align:center; color:#9ca3af; padding: 40px;">目前还没有人发帖，快来抢沙发吧！</p>';
        return;
    }

    const filtered = applyFilters(allPosts);

    if (filtered.length === 0) {
        postsContainer.innerHTML = '<p style="text-align:center; color:#9ca3af; padding: 40px;">未找到匹配的帖子。</p>';
        return;
    }

    const currentUser = localStorage.getItem('currentUser');

    filtered.forEach(post => {
        const isMyPost = (post.author === currentUser);
        
        // 三重状态判断逻辑
        let actionBtn = '';
        if (isMyPost) {
            actionBtn = `<div style="display:flex; align-items:center; gap: 12px; white-space: nowrap">
                         <span style="color: #10b981; font-weight: bold; font-size: 14px;">(这是你的帖子)</span>
                         <button onclick="deletePost(${post.id})" class="btn-delete">🗑️ 删除</button>
                       </div>`;
        } else if (post.has_applied) {
            // 已报名状态
            actionBtn = `<button disabled class="btn-applied">✅ 已报名</button>`;
        } else {
            // 还没报名
            actionBtn = `<button onclick="applyForPost(${post.id})" class="btn-apply">✋ 我要报名</button>`;
        }

        const postHTML = `
            <div class="post-card">
                <div class="post-title-row">
                    <span class="post-tag">${post.type || ''}</span> 
                    <span>${post.title}</span>
                </div>
                <div class="post-content-text">
                    ${post.content}
                </div>
                <div class="post-footer">
                    <span class="post-author-info">发布者: <a href="profile.html?user=${post.author}" style="color: #3b82f6; text-decoration: none; font-weight: bold;">${post.author}</a> &nbsp;|&nbsp; ${post.created_at || ''}</span>
                    ${actionBtn}
                </div>
            </div>
        `;
        postsContainer.innerHTML += postHTML;
    });
}

// 应用过滤器并返回新数组
function applyFilters(posts) {
    const text = (document.getElementById('filter-text')?.value || '').trim().toLowerCase();
    const location = (document.getElementById('filter-location')?.value || '').trim().toLowerCase();
    const compensation = (document.getElementById('filter-compensation')?.value || '');
    const sortBy = (document.getElementById('sort-by')?.value || 'newest');

    let result = posts.slice(); // 克隆数组

    if (text) {
        result = result.filter(p => ((p.title || '') + ' ' + (p.content || '')).toLowerCase().includes(text));
    }

    if (location) {
        // 如果后端没有 location 字段，这里不会匹配任何内容
        result = result.filter(p => (p.location || '').toLowerCase().includes(location));
    }

    if (compensation) {
        // 这里使用约定字段：p.compensation 或 p.pay
        if (compensation === 'free') {
            result = result.filter(p => !p.compensation && !p.pay);
        } else if (compensation === 'paid-low') {
            result = result.filter(p => (p.compensation === 'low' || (p.pay && p.pay <= 50)));
        } else if (compensation === 'paid-high') {
            result = result.filter(p => (p.compensation === 'high' || (p.pay && p.pay > 50)));
        }
    }

    // 简单基于字段 popularity / likes / views 排序
    if (sortBy === 'popular') {
        result.sort((a,b) => (b.popularity || b.likes || b.views || 0) - (a.popularity || a.likes || a.views || 0));
    } else {
        // newest
        result.sort((a,b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }

    return result;
}

function clearFilters() {
    if (document.getElementById('filter-text')) document.getElementById('filter-text').value = '';
    if (document.getElementById('filter-location')) document.getElementById('filter-location').value = '';
    if (document.getElementById('filter-compensation')) document.getElementById('filter-compensation').value = '';
    if (document.getElementById('sort-by')) document.getElementById('sort-by').value = 'newest';
    renderPosts();
}

// 在页面加载后给过滤控件绑定事件（实时过滤）
window.addEventListener('DOMContentLoaded', () => {
    ['filter-text','filter-location','filter-compensation','sort-by'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => renderPosts());
    });
});

// 🌟 【新增：点击报名按钮触发的函数】
async function applyForPost(postId) {
    const applicantName = localStorage.getItem('currentUser');
    
    // 借用浏览器原生自带的输入弹窗，最适合快速做 MVP
    const message = prompt('请输入你的申请留言 (例如：我会弹吉他，周末有空，选我！)：');
    
    // 如果用户点了取消，或者什么都没填
    if (message === null) return; 
    if (message.trim() === '') {
        alert('留言不能为空哦！');
        return;
    }

    // 把申请数据发给后端
    try {
        const response = await fetch('http://localhost:3000/api/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                post_id: postId, 
                applicant_name: applicantName, 
                message: message 
            })
        });
        
        const data = await response.json();

        if (data.success) {
            alert('🎉 ' + data.message);
            // 🌟 报名成功后，重新拉取帖子，按钮会立刻刷新变成灰色的“已报名”！
            fetchPosts();
        } else {
            alert('申请失败：' + data.message);
        }
    } catch (error) {
        alert('网络错误，无法提交申请！');
    }
}

// 🌟 【新增：打开收件箱】
async function openInbox() {
    // 1. 显示弹窗 (把 display 从 none 变成 flex，让它居中显示)
    document.getElementById('inbox-modal').style.display = 'flex';
    const messagesContainer = document.getElementById('inbox-messages');
    messagesContainer.innerHTML = '<p>正在疯狂拉取消息中...</p>';

    const currentUser = localStorage.getItem('currentUser');

    try {
        // 2. 向后端请求属于我的消息 (注意 URL 后面带了 ?user=xxx)
        const response = await fetch(`http://localhost:3000/api/my-messages?user=${currentUser}`);
        const data = await response.json();

        if (data.success) {
            messagesContainer.innerHTML = ''; // 清空加载提示
            
            // 如果没人给我发消息
            if (data.data.length === 0) {
                messagesContainer.innerHTML = '<p style="color: #6b7280; text-align: center;">暂时还没有人申请你的帖子哦~</p>';
                return;
            }

            // 如果有消息，循环渲染出来
            data.data.forEach(msg => {
                const msgHTML = `
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #3b82f6; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                            <p style="font-size: 14px; color: #6b7280; margin: 0;">
                                <a href="profile.html?user=${msg.applicant_name}" style="color: #3b82f6; text-decoration: none; font-weight: bold;">${msg.applicant_name}</a> 申请了你的帖子: <span style="color: #1f2937;">《${msg.title}》</span>
                            </p>
                            <div style="display:flex; gap:8px;">
                                <button onclick="openChat('${msg.applicant_name}','${msg.title.replace(/'/g,"\\'")}' )" style="padding:6px 10px; border-radius:6px; background:#3b82f6; color:white; border:none; cursor:pointer;">私信</button>
                            </div>
                        </div>
                        <p style="background: white; padding: 10px; border-radius: 6px; border: 1px solid #e5e7eb; margin: 0;">
                            💬 留言: ${msg.message}
                        </p>
                    </div>
                `;
                messagesContainer.innerHTML += msgHTML;
            });
        }
    } catch (error) {
        messagesContainer.innerHTML = '<p style="color: red;">网络错误，无法加载消息！</p>';
    }
}

// 🌟 【新增：关闭收件箱】
function closeInbox() {
    document.getElementById('inbox-modal').style.display = 'none';
}

// ===== 简单私聊功能（前端） =====
function openChat(withUser, contextTitle) {
    document.getElementById('chat-with').innerText = `与 ${withUser} 的聊天 ${contextTitle ? ' — ' + contextTitle : ''}`;
    document.getElementById('chat-modal').style.display = 'flex';
    document.getElementById('chat-history').innerHTML = '<p style="color:#9ca3af; text-align:center;">正在加载对话...</p>';
    // 记住当前聊天对象
    window._chatTarget = withUser;
    fetchConversation(withUser);
}

function closeChat() {
    document.getElementById('chat-modal').style.display = 'none';
    document.getElementById('chat-history').innerHTML = '';
    window._chatTarget = null;
}

async function fetchConversation(withUser) {
    const currentUser = localStorage.getItem('currentUser');
    try {
        const resp = await fetch(`http://localhost:3000/api/conversation?user=${currentUser}&with=${withUser}`);
        const j = await resp.json();
        const h = document.getElementById('chat-history');
        if (!j.success) {
            h.innerHTML = '<p style="color:#ef4444; text-align:center;">无法加载对话</p>';
            return;
        }
        h.innerHTML = '';
        (j.data || []).forEach(m => {
            const side = (m.sender === currentUser) ? 'right' : 'left';
            const msgEl = document.createElement('div');
            msgEl.style.margin = '8px 0';
            msgEl.style.display = 'flex';
            msgEl.style.justifyContent = side === 'right' ? 'flex-end' : 'flex-start';
            msgEl.innerHTML = `<div style="background:${side==='right'? '#3b82f6':'#ffffff'}; color:${side==='right'?'#fff':'#111827'}; padding:10px 12px; border-radius:12px; max-width:75%; border:1px solid #e5e7eb;">${m.message}</div>`;
            h.appendChild(msgEl);
        });
        h.scrollTop = h.scrollHeight;
    } catch (err) {
        document.getElementById('chat-history').innerHTML = '<p style="color:#ef4444; text-align:center;">网络错误，无法加载对话</p>';
    }
}

async function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const text = (input.value || '').trim();
    if (!text) return;
    const currentUser = localStorage.getItem('currentUser');
    const to = window._chatTarget;
    if (!to) return alert('目标用户缺失');

    try {
        const resp = await fetch('http://localhost:3000/api/messages', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sender: currentUser, recipient: to, message: text })
        });
        const j = await resp.json();
        if (j.success) {
            input.value = '';
            // 立即把消息推到界面上
            const h = document.getElementById('chat-history');
            const msgEl = document.createElement('div');
            msgEl.style.margin = '8px 0';
            msgEl.style.display = 'flex';
            msgEl.style.justifyContent = 'flex-end';
            msgEl.innerHTML = `<div style="background:#3b82f6; color:#fff; padding:10px 12px; border-radius:12px; max-width:75%;">${text}</div>`;
            h.appendChild(msgEl);
            h.scrollTop = h.scrollHeight;
        } else {
            alert('发送失败：' + j.message);
        }
    } catch (err) {
        alert('网络错误，发送失败');
    }
}

// 🌟 【新增：切换下拉菜单时，动态改变提示词】
function updatePlaceholders() {
    const type = document.getElementById('post-type').value;
    const titleInput = document.getElementById('post-title');
    const contentInput = document.getElementById('post-content');

    if (type === '寻人组队') {
        titleInput.placeholder = "一句话概括你的需求 (如：急寻一名会弹吉他的同学迎新晚会伴奏)";
        contentInput.placeholder = "详细描述一下任务时间、地点、要求或可能愿意提供的报酬...";
    } else if (type === '提供技能') {
        titleInput.placeholder = "一句话概括你能做什么 (如：精通什么编程语言/海报设计/视频剪辑)";
        contentInput.placeholder = "详细描述一下你的技能水平、空闲时间以及可能会存在的期望报酬...";
    }
}

// 🌟 【新增：删帖功能】
async function deletePost(postId) {
    // 弹窗确认，防止误触
    if (!confirm('确定要删除这个帖子吗？删除后不可恢复哦！')) {
        return; 
    }

    const currentUser = localStorage.getItem('currentUser');

    try {
        // 向后端发送 DELETE 请求
        const response = await fetch(`http://localhost:3000/api/posts/${postId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: currentUser }) // 告诉后端我是谁，防止别人删我的帖
        });

        const data = await response.json();

        if (data.success) {
            alert('🗑️ 删除成功！');
            fetchPosts(); // 重新拉取最新的帖子列表
        } else {
            alert('删除失败：' + data.message);
        }
    } catch (error) {
        alert('网络错误，删除失败！');
    }
}