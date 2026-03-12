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

// 获取并显示帖子列表
async function fetchPosts() {
    try {
        const response = await fetch('http://localhost:3000/api/posts');
        const data = await response.json();

        if (data.success) {
            const postsContainer = document.getElementById('posts-container');
            postsContainer.innerHTML = ''; // 先清空原来的内容

            if (data.data.length === 0) {
                postsContainer.innerHTML = '<p style="text-align:center; color:#999;">目前还没有人发帖，快来抢沙发吧！</p>';
                return;
            }

            const currentUser = localStorage.getItem('currentUser');

            // 循环遍历后端的每一条帖子，并动态生成 HTML 代码
            // 💡 C++ 映射：类似 for(auto& post : posts) { cout << post.title; }
            data.data.forEach(post => {
                // 🌟 判断：这是我的帖子，还是别人的帖子？
                const isMyPost = (post.author === currentUser);
                
                // 🌟 动态生成按钮：我的帖子显示绿色文字，别人的帖子显示绿色按钮
                // 🌟 判断：如果是我的帖子，显示“删帖按钮”；如果是别人的，显示“报名按钮”
                // 🌟 使用全新设计的按钮类名 btn-apply 和 btn-delete
                const actionBtn = isMyPost 
                    ? `<div style="display:flex; align-items:center; gap: 12px;">
                         <span style="color: #10b981; font-weight: bold; font-size: 14px;">(这是你的帖子)</span>
                         <button onclick="deletePost(${post.id})" class="btn-delete">🗑️ 删除</button>
                       </div>` 
                    : `<button onclick="applyForPost(${post.id})" class="btn-apply">✋ 我要报名</button>`;

                // 🌟 使用全新设计的卡片结构排版
                const postHTML = `
                    <div class="post-card">
                        <div class="post-title-row">
                            <span class="post-tag">${post.type}</span> 
                            <span>${post.title}</span>
                        </div>
                        <div class="post-content-text">
                            ${post.content}
                        </div>
                        <div class="post-footer">
                            <span class="post-author-info">发布者: <strong>${post.author}</strong> &nbsp;|&nbsp; ${post.created_at}</span>
                            ${actionBtn}
                        </div>
                    </div>
                `;
                postsContainer.innerHTML += postHTML;
            });
        }
    } catch (error) {
        console.error("加载帖子失败", error);
    }
}

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
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #3b82f6;">
                        <p style="font-size: 14px; color: #6b7280; margin-bottom: 5px;">
                            <strong>${msg.applicant_name}</strong> 申请了你的帖子: <span style="color: #1f2937;">《${msg.title}》</span>
                        </p>
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

// 🌟 【新增：切换下拉菜单时，动态改变提示词】
function updatePlaceholders() {
    const type = document.getElementById('post-type').value;
    const titleInput = document.getElementById('post-title');
    const contentInput = document.getElementById('post-content');

    if (type === '寻人组队') {
        titleInput.placeholder = "一句话概括你的需求 (如：急寻一名会弹吉他的同学迎新晚会伴奏)";
        contentInput.placeholder = "详细描述一下任务时间、地点、要求或报酬...";
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