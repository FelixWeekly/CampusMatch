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
            document.getElementById('display-bio').innerText = u.bio;

            // 渲染技能标签
            const skillsContainer = document.getElementById('display-skills');
            skillsContainer.innerHTML = '';
            if (u.skills && u.skills !== '暂无技能标签') {
                u.skills.split(/[,，]/).forEach(skill => {
                    if (skill.trim()) skillsContainer.innerHTML += `<span class="skill-tag">${skill.trim()}</span>`;
                });
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
                document.getElementById('edit-skills').value = u.skills === '暂无技能标签' ? '' : u.skills;
                document.getElementById('edit-bio').value = u.bio === '这个人很懒，还没写自我介绍~' ? '' : u.bio;
                document.getElementById('edit-portfolio').value = u.portfolio;
            } else {
                // 看别人：评价按钮
                btnContainer.innerHTML = `<button onclick="openModal('review-modal')" style="width: 100%; background: #10b981; color: white; padding: 12px; border-radius: 8px; font-weight: bold;">🌟 写评价 / 反馈</button>`;
            }

            // 3. 渲染右侧评价列表
            document.getElementById('display-avg').innerHTML = `${data.avgRating} <span style="font-size: 20px;">⭐</span>`;
            const reviewsList = document.getElementById('reviews-list');
            if (data.reviews.length > 0) {
                reviewsList.innerHTML = '';
                data.reviews.forEach(r => {
                    const starsStr = '⭐'.repeat(r.rating);
                    // 🌟 核心：这条评语是我写的吗？是的话，就给他一个红色的删除按钮！
                    const deleteBtn = (r.reviewer === currentUser) 
                        ? `<button onclick="deleteReview(${r.id})" style="background: none; border: none; color: #ef4444; font-size: 13px; cursor: pointer; text-decoration: underline;">删除</button>` 
                        : '';

                    reviewsList.innerHTML += `
                        <div class="review-item">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; align-items: center;">
                                <div>
                                    <strong>${r.reviewer}</strong>
                                    <span class="stars" style="margin-left: 8px;">${starsStr}</span>
                                </div>
                                ${deleteBtn}
                            </div>
                            <p style="color: #4b5563; font-size: 14px; margin: 0;">${r.comment}</p>
                            <p style="color: #9ca3af; font-size: 12px; margin-top: 8px;">${r.created_at}</p>
                        </div>
                    `;
                });
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
    const skills = document.getElementById('edit-skills').value || '暂无技能标签';
    const portfolio = document.getElementById('edit-portfolio').value;
    const bio = document.getElementById('edit-bio').value || '这个人很懒，还没写自我介绍~';

    try {
        const res = await fetch('http://localhost:3000/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: currentUser, department, grade, skills, portfolio, bio })
        });
        const data = await res.json();
        if (data.success) {
            alert('保存成功！');
            closeModal('edit-modal');
            fetchProfileData(); // 刷新页面数据
        }
    } catch (err) { alert('保存失败！'); }
}

// 提交评价
async function submitReview() {
    const rating = document.getElementById('review-rating').value;
    const comment = document.getElementById('review-comment').value;

    if (!comment.trim()) { alert('评语不能为空哦！'); return; }

    try {
        const res = await fetch('http://localhost:3000/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewer: currentUser, reviewee: viewingUser, rating: parseInt(rating), comment })
        });
        const data = await res.json();
        if (data.success) {
            alert('评价提交成功！');
            closeModal('review-modal');
            fetchProfileData(); // 刷新星级和列表
        }
    } catch (err) { alert('提交评价失败！'); }
}

// 🌟 【新增：删除评价】
async function deleteReview(reviewId) {
    if (!confirm('确定要删除这条评价吗？')) return;
    
    try {
        const res = await fetch(`http://localhost:3000/api/reviews/${reviewId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewer: currentUser }) // 告诉后端是谁要删的
        });
        const data = await res.json();
        if (data.success) {
            alert('🗑️ 评价已删除！');
            fetchProfileData(); // 重新拉取主页数据（星级评分会自动重新计算！）
        } else {
            alert('删除失败：' + data.message);
        }
    } catch (err) {
        alert('网络错误，删除失败！');
    }
}