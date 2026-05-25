const currentUser = localStorage.getItem('currentUser');
// 获取网址栏里的 user 参数 (比如 profile.html?user=李雷)
const urlParams = new URLSearchParams(window.location.search);
const viewingUser = urlParams.get('user') || currentUser; 

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

window.onload = function() {
    if (!currentUser) {
        alert('请先登录！');
        window.location.href = 'index.html';
        return;
    }
    // 只有查看自己主页时可以换头像
    const isOwnProfile = viewingUser === currentUser;
    const wrapper = document.getElementById('avatar-wrapper');
    if (wrapper) {
        if (isOwnProfile) {
            wrapper.classList.add('is-owner');
            wrapper.style.cursor = 'pointer';
            wrapper.title = '点击更换头像';
            wrapper.onclick = function() { document.getElementById('avatar-file-input').click(); };
        } else {
            wrapper.style.cursor = 'default';
            wrapper.title = '';
            wrapper.onclick = null;
        }
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
            // 默认头像：名字首字母
            const avatarIcon = document.getElementById('avatar-icon');
            if (avatarIcon) avatarIcon.textContent = (u.name || '?').charAt(0).toUpperCase();
            // 优先使用资料接口返回的头像
            if (u.avatar) {
                const img = document.getElementById('avatar-img');
                if (img) {
                    img.src = u.avatar;
                    img.style.display = '';
                }
                if (avatarIcon) avatarIcon.style.display = 'none';
            } else {
                // 兼容旧数据：再走一次头像接口
                loadUserAvatar(u.name);
            }
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
                document.getElementById('btn-back-profile').style.display = 'none';
                const delBtn = document.getElementById('btn-delete-account');
                if (delBtn) delBtn.style.display = '';
                btnContainer.innerHTML = `<button onclick="openEditModal()" style="width: 100%; background: var(--primary); color: var(--on-primary); padding: 12px; border-radius: var(--radius-sm); font-weight: 800;">Edit Profile</button>`;
                document.getElementById('edit-dept').value = u.department === '未设置院系' ? '' : u.department;
                document.getElementById('edit-grade').value = u.grade === '未设置年级' ? '' : u.grade;
                document.getElementById('edit-campus').value = u.campus || '沙河校区';
                document.getElementById('edit-bio').value = u.bio === '这个人很懒，还没写自我介绍~' ? '' : u.bio;
                document.getElementById('edit-portfolio').value = u.portfolio;
            } else {
                document.getElementById('btn-back-profile').style.display = '';
                const delBtn2 = document.getElementById('btn-delete-account');
                if (delBtn2) delBtn2.style.display = 'none';
                btnContainer.innerHTML = `
                    <button onclick="window.location.href='messages.html?user=${encodeURIComponent(viewingUser)}'" style="width: 100%; background: var(--primary); color: var(--on-primary); padding: 12px; border-radius: var(--radius-sm); font-weight: 800;">
                        <span class="material-symbols-outlined" style="vertical-align:middle; font-size:18px;">send</span> Send Message
                    </button>
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

            const ongoingBox = document.getElementById('ongoing-activities');
            const historyBox = document.getElementById('history-activities');
            const ongoing = data.activities && Array.isArray(data.activities.ongoing) ? data.activities.ongoing : [];
            const history = data.activities && Array.isArray(data.activities.history) ? data.activities.history : [];
            if (ongoingBox) {
                ongoingBox.innerHTML = ongoing.length
                    ? ongoing.slice(0, 8).map((item) => `
                        <div class="activity-item">
                            <strong style="font-size:13px; color:#1f2937;">${escapeHtml(item.title)}</strong>
                            <p style="font-size:12px; color:#64748b; margin-top:4px;">${escapeHtml(item.kind)} · ${escapeHtml(item.status)} · ${escapeHtml(item.role || '-')}</p>
                        </div>
                     `).join('')
                    : '<p style="font-size:12px; color:#94a3b8;">暂无进行中活动</p>';
            }
            if (historyBox) {
                historyBox.innerHTML = history.length
                    ? history.slice(0, 8).map((item) => `
                        <div class="activity-item">
                            <strong style="font-size:13px; color:#1f2937;">${escapeHtml(item.title)}</strong>
                            <p style="font-size:12px; color:#64748b; margin-top:4px;">${escapeHtml(item.kind)} · ${escapeHtml(item.status)} · ${escapeHtml(item.role || '-')}</p>
                        </div>
                     `).join('')
                    : '<p style="font-size:12px; color:#94a3b8;">暂无历史活动</p>';
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

// Private messaging → navigate to messages.html?user= (see send message button in fetchProfileData)

/* ── Account Deletion ── */
function openDeleteAccount() {
    document.getElementById('delete-overlay').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeDeleteAccount() {
    document.getElementById('delete-overlay').style.display = 'none';
    document.body.style.overflow = '';
}

function toggleDeleteBtn() {
    const checked = document.getElementById('delete-confirm')?.checked;
    const btn = document.getElementById('btn-delete-confirm');
    if (!btn) return;
    if (checked) {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
    } else {
        btn.disabled = true;
        btn.style.opacity = '0.4';
        btn.style.cursor = 'default';
    }
}

async function submitDeleteAccount() {
    const user = localStorage.getItem('currentUser');
    if (!user) return;
    const confirmed = document.getElementById('delete-confirm')?.checked;
    if (!confirmed) return alert('Please confirm you understand this is irreversible.');

    const checkboxes = document.querySelectorAll('#delete-overlay input[type="checkbox"]:checked');
    const reasons = [];
    checkboxes.forEach((cb) => { if (cb.id !== 'delete-confirm') reasons.push(cb.value); });
    const feedback = document.getElementById('delete-feedback')?.value?.trim() || '';

    try {
        const resp = await fetch('http://localhost:3000/api/account', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, reason: reasons.join(', '), feedback })
        });
        const json = await resp.json();
        if (json.success) {
            alert('Your account has been deleted. Goodbye!');
            localStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        } else {
            alert(json.message || 'Deletion failed');
        }
    } catch (_) {
        alert('Network error. Please try again.');
    }
}

async function loadUserAvatar(userName) {
    try {
        const resp = await fetch('http://localhost:3000/api/users/avatar/' + encodeURIComponent(userName));
        const json = await resp.json();
        const img = document.getElementById('avatar-img');
        const icon = document.getElementById('avatar-icon');
        if (json.success && json.avatar && img) {
            img.src = json.avatar;
            img.style.display = '';
            if (icon) icon.style.display = 'none';
        } else {
            // 无头像时显示首字母（已在fetchProfileData中设置）
            if (img) img.style.display = 'none';
            if (icon) icon.style.display = '';
        }
    } catch (_) {}
}

function uploadAvatar(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (file.size > 256 * 1024) return alert('Image must be under 256KB');

    const reader = new FileReader();
    reader.onload = async function() {
        const currentUser = localStorage.getItem('currentUser');
        try {
            const resp = await fetch('http://localhost:3000/api/users/avatar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user: currentUser, avatar: reader.result })
            });
            const json = await resp.json();
            if (json.success) {
                const img = document.getElementById('avatar-img');
                const icon = document.getElementById('avatar-icon');
                if (img) { img.src = reader.result; img.style.display = ''; }
                if (icon) icon.style.display = 'none';
            } else {
                alert(json.message || 'Upload failed');
            }
        } catch (_) { alert('Network error'); }
    };
    reader.readAsDataURL(file);
}
