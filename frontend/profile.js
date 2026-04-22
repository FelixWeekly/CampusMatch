const currentUser = localStorage.getItem('currentUser');
// 获取网址栏里的 user 参数 (比如 profile.html?user=李雷)
const urlParams = new URLSearchParams(window.location.search);
const viewingUser = urlParams.get('user') || currentUser; 

window.onload = function() {
    if (!currentUser) {
        alert('请先登录！');
        window.location.href = 'index.html';
        return;
    }
    fetchProfileData();
};

// 拉取个人主页全部数据
async function fetchProfileData() {
    try {
        const response = await fetch(`http://localhost:3000/api/profile/${viewingUser}`);
        const data = await response.json();

        if (data.success) {
            // 1. 渲染左侧个人资料
            const u = data.data;
            document.getElementById('display-name').innerText = u.name;
            document.getElementById('avatar-text').innerText = u.name.charAt(0); // 取名字首字母当头像
            document.getElementById('display-dept-grade').innerText = `${u.department} · ${u.grade}`;
            document.getElementById('display-campus-hours').innerText = `校区: ${u.campus || '未设置'}`;
            document.getElementById('display-bio').innerText = u.bio;

            // 渲染模型自动识别标签
            const autoTagsEl = document.getElementById('display-auto-tags');
            autoTagsEl.innerHTML = '';
            const softTags = data.featureStore && data.featureStore.soft_tags ? data.featureStore.soft_tags : {};
            const autoSkills = Array.isArray(softTags.skills) ? softTags.skills : [];
            const autoInterests = Array.isArray(softTags.interests) ? softTags.interests : [];
            const mergedTags = [...autoSkills, ...autoInterests];
            if (mergedTags.length > 0) {
                mergedTags.forEach((tag, idx) => {
                    const style = idx < autoSkills.length
                        ? 'background:#eff6ff; color:#2563eb;'
                        : 'background:#ecfeff; color:#0e7490;';
                    autoTagsEl.innerHTML += `<span class="skill-tag" style="${style}">${tag}</span>`;
                });
            } else {
                autoTagsEl.innerHTML = '<span style="font-size:12px; color:#9ca3af;">系统将基于你的简介自动整理标签</span>';
            }

            const mbtiFromBio = softTags.mbti || '';
            const bioMbtiEl = document.getElementById('display-bio-mbti');
            if (mbtiFromBio) {
                bioMbtiEl.style.display = 'block';
                bioMbtiEl.innerText = `MBTI：${mbtiFromBio}`;
            } else {
                bioMbtiEl.style.display = 'none';
                bioMbtiEl.innerText = '';
            }

            const featureUpdated = document.getElementById('display-feature-updated');
            if (data.featureStore && data.featureStore.updated_at) {
                featureUpdated.innerText = `特征画像更新时间：${data.featureStore.updated_at}`;
            } else {
                featureUpdated.innerText = '特征画像尚未生成';
            }

            // 渲染作品集链接
            const portfolioLink = document.getElementById('display-portfolio');
            if (u.portfolio) {
                portfolioLink.href = u.portfolio;
                portfolioLink.style.display = 'inline-block';
            }

            // 2. 动态决定显示什么按钮
            const btnContainer = document.getElementById('action-btn-container');
            if (viewingUser === currentUser) {
                // 自己看自己：编辑按钮，并预填数据到模态框里
                btnContainer.innerHTML = `<button onclick="openEditModal()" style="width: 100%; background: #111827; color: white; padding: 12px; border-radius: 8px; font-weight: bold;">✍️ 编辑个人资料</button>`;
                document.getElementById('edit-dept').value = u.department === '未设置院系' ? '' : u.department;
                document.getElementById('edit-grade').value = u.grade === '未设置年级' ? '' : u.grade;
                document.getElementById('edit-campus').value = u.campus || '沙河校区';
                document.getElementById('edit-bio').value = u.bio === '这个人很懒，还没写自我介绍~' ? '' : u.bio;
                document.getElementById('edit-portfolio').value = u.portfolio;
            } else {
                // 看别人：仅保留私信按钮，评分入口统一迁移到项目结项后
                btnContainer.innerHTML = `
                    <button onclick="openChatWithUser('${viewingUser}')" style="width: 100%; background: #3b82f6; color: white; padding: 12px; border-radius: 8px; font-weight: bold;">💬 发私信</button>
                `;
            }

            // 3. 渲染右侧评价列表
            document.getElementById('display-avg').innerHTML = `${data.avgFinalScore} <span style="font-size: 16px; color:#6b7280;">/100</span> <span style="font-size: 18px;">(${data.avgStar}⭐)</span>`;
            const reviewsList = document.getElementById('reviews-list');
            if (data.reviews.length > 0) {
                reviewsList.innerHTML = '';
                data.reviews.forEach(r => {
                    const starsStr = '⭐'.repeat(r.rating || 0);
                    const finalScoreText = (r.final_score || 0).toFixed(1);
                    const objectiveText = (r.objective_score || 0).toFixed(1);
                    const subjectiveText = (r.subjective_score || 0).toFixed(1);

                    reviewsList.innerHTML += `
                        <div class="review-item">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center;">
                                <div>
                                    <strong>${r.reviewer}</strong>
                                    <span style="margin-left: 8px; color:#6b7280; font-size:12px;">项目 #${r.project_id}</span>
                                </div>
                                <span class="stars">${starsStr}</span>
                            </div>
                            <p style="color: #4b5563; font-size: 14px; margin: 0 0 8px 0;">${r.comment || '无评语'}</p>
                            <p style="color:#111827; font-size:13px; margin:0;">客观分 ${objectiveText} + 主观分 ${subjectiveText} => 总分 ${finalScoreText}</p>
                            <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">${r.created_at}</p>
                        </div>
                    `;
                });
            } else {
                reviewsList.innerHTML = '<p style="color: #9ca3af; text-align: center; padding: 20px;">暂无任务结项评价</p>';
            }
        }
    } catch (error) {
        alert('无法加载用户数据！');
    }
}

// 模态框开/关控制
function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function openEditModal() { openModal('edit-modal'); }

// 保存资料
async function saveProfile() {
    const department = document.getElementById('edit-dept').value || '未设置院系';
    const grade = document.getElementById('edit-grade').value || '未设置年级';
    const campus = document.getElementById('edit-campus').value || '沙河校区';
    const portfolio = document.getElementById('edit-portfolio').value;
    const bio = document.getElementById('edit-bio').value || '这个人很懒，还没写自我介绍~';

    try {
        const res = await fetch('http://localhost:3000/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: currentUser,
                department,
                grade,
                campus,
                portfolio,
                bio
            })
        });
        const data = await res.json();
        if (data.success) {
            alert('保存成功！');
            closeModal('edit-modal');
            fetchProfileData(); // 刷新页面数据
        }
    } catch (err) { alert('保存失败！'); }
}

// ===== 私聊功能 =====
function openChatWithUser(withUser) {
    document.getElementById('chat-with').innerText = `与 ${withUser} 的聊天`;
    document.getElementById('chat-modal').style.display = 'flex';
    document.getElementById('chat-history').innerHTML = '<p style="color:#9ca3af; text-align:center;">正在加载对话...</p>';
    window._chatTarget = withUser;
    fetchConversation(withUser);
    
    // 为输入框绑定事件监听器（延迟一帧确保 DOM 已准备好）
    setTimeout(() => {
        const chatInput = document.getElementById('chat-input');
        if (!chatInput) {
            console.error('chat-input 元素未找到');
            return;
        }
        
        chatInput.focus();
        
        // 移除旧的事件监听（防止重复绑定）
        chatInput.removeEventListener('keydown', handleChatInputKeyDown);
        
        // 绑定按键事件（回车发送）
        chatInput.addEventListener('keydown', handleChatInputKeyDown);
    }, 0);
}

function closeChat() {
    document.getElementById('chat-modal').style.display = 'none';
    document.getElementById('chat-history').innerHTML = '';
    window._chatTarget = null;
}

async function fetchConversation(withUser) {
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
    
    // 防止重复发送
    if (window._isSending) return;
    window._isSending = true;
    
    const to = window._chatTarget;
    if (!to) {
        window._isSending = false;
        return alert('目标用户缺失');
    }

    try {
        const resp = await fetch('http://localhost:3000/api/messages', {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ sender: currentUser, recipient: to, message: text })
        });
        const j = await resp.json();
        if (j.success) {
            input.value = '';
            const h = document.getElementById('chat-history');
            const msgEl = document.createElement('div');
            msgEl.style.margin = '8px 0';
            msgEl.style.display = 'flex';
            msgEl.style.justifyContent = 'flex-end';
            msgEl.innerHTML = `<div style="background:#3b82f6; color:#fff; padding:10px 12px; border-radius:12px; max-width:75%;">${text}</div>`;
            h.appendChild(msgEl);
            h.scrollTop = h.scrollHeight;
            input.focus();
        } else {
            alert('发送失败：' + j.message);
        }
    } catch (err) {
        alert('网络错误，发送失败');
    } finally {
        window._isSending = false;
    }
}

// 处理回车发送的函数
function handleChatInputKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        sendChatMessage();
    }
}