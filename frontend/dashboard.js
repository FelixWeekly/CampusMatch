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
    loadMyProjects();
    
    // 4. 绑定补偿复选框事件
    const compensationCheckbox = document.getElementById('post-compensation');
    const amountInput = document.getElementById('post-amount');
    
    if (compensationCheckbox && amountInput) {
        compensationCheckbox.addEventListener('change', function() {
            amountInput.style.display = this.checked ? 'block' : 'none';
            if (!this.checked) {
                amountInput.value = '';
            }
        });
    }
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
    
    // 根据类型确定报酬
    let hasCompensation = false;
    let amount = '';
    
    if (type === '寻人组队') {
        hasCompensation = document.getElementById('post-compensation').checked;
        amount = document.getElementById('post-amount').value.trim();
        
        if (hasCompensation && amount === '') {
            alert('请输入报酬金额！');
            return;
        }
    }
    // 如果是"提供技能"，compensation 保持为空字符串

    // 打包数据发送给后端
    try {
        const response = await fetch('http://localhost:3000/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                author, 
                title, 
                content, 
                type, 
                location: '', 
                compensation: (type === '寻人组队' && hasCompensation) ? amount : ''
            })
        });
        const data = await response.json();

        if (data.success) {
            alert('发布成功！');
            // 清空输入框
            document.getElementById('post-title').value = '';
            document.getElementById('post-content').value = '';
            document.getElementById('post-compensation').checked = false;
            document.getElementById('post-amount').value = '';
            document.getElementById('post-amount').style.display = 'none';
            document.getElementById('post-type').value = '寻人组队'; // 重置为默认类型
            updatePlaceholders(); // 更新提示词
            // 重新刷新帖子列表
            fetchPosts();
        }
    } catch (error) {
        alert('网络错误，发布失败！');
    }
}

// 本地缓存所有帖子，便于过滤/排序
let allPosts = [];
let postsCollapsed = false;
let postsExpanded = false;
const postsPreviewLimit = 5;
let navTicking = false;
let lastScrollY = 0;
let lastScrollTs = Date.now();
let indicatorResetTimer = null;

function scrollToSection(section) {
    if (section === 'top') return scrollToTop();
    if (section === 'posts') {
        const posts = document.getElementById('posts-section');
        if (posts) posts.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    if (section === 'team') return scrollToTeamCenter();
}

function scrollToTeamCenter() {
    const section = document.getElementById('team-center-section');
    if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateQuickNavActive() {
    const topEl = document.getElementById('top-section');
    const teamEl = document.getElementById('team-center-section');
    const postsRect = document.getElementById('posts-section')?.getBoundingClientRect();
    const teamRect = teamEl?.getBoundingClientRect();
    const viewportMark = window.innerHeight * 0.3;
    let active = 'top';

    if (teamRect && teamRect.top <= viewportMark) {
        active = 'team';
    } else if (postsRect && postsRect.top <= viewportMark) {
        active = 'posts';
    }

    ['top', 'posts', 'team'].forEach((key) => {
        const el = document.getElementById(`nav-${key}`);
        if (!el) return;
        if (key === active) el.classList.add('active');
        else el.classList.remove('active');
    });

    const indicator = document.getElementById('quick-progress-indicator');
    if (indicator && topEl && teamEl) {
        const topY = topEl.getBoundingClientRect().top + window.scrollY;
        const teamY = teamEl.getBoundingClientRect().top + window.scrollY;
        const denominator = Math.max(1, teamY - topY);
        const raw = ((window.scrollY - topY) / denominator) * 100;
        const percent = Math.max(0, Math.min(100, raw));
        indicator.style.top = `${percent}%`;
    }
}

function scheduleQuickNavUpdate() {
    const now = Date.now();
    const dy = Math.abs(window.scrollY - lastScrollY);
    const dt = Math.max(1, now - lastScrollTs);
    const velocity = dy / dt;
    const indicator = document.getElementById('quick-progress-indicator');

    if (indicator) {
        const strength = Math.min(0.35, velocity * 0.22);
        const scaleY = (1 + strength).toFixed(3);
        const scaleX = (1 - strength * 0.42).toFixed(3);
        indicator.style.setProperty('--indicator-scale-y', scaleY);
        indicator.style.setProperty('--indicator-scale-x', scaleX);

        if (indicatorResetTimer) clearTimeout(indicatorResetTimer);
        indicatorResetTimer = setTimeout(() => {
            indicator.style.setProperty('--indicator-scale-y', '1');
            indicator.style.setProperty('--indicator-scale-x', '1');
        }, 140);
    }

    lastScrollY = window.scrollY;
    lastScrollTs = now;

    if (navTicking) return;
    navTicking = true;
    requestAnimationFrame(() => {
        updateQuickNavActive();
        navTicking = false;
    });
}

window.addEventListener('scroll', scheduleQuickNavUpdate);
window.addEventListener('resize', scheduleQuickNavUpdate);

function togglePostsSection() {
    const body = document.getElementById('posts-section-body');
    const btn = document.getElementById('toggle-posts-btn');
    if (!body || !btn) return;

    postsCollapsed = !postsCollapsed;

    if (postsCollapsed) {
        body.style.transition = 'max-height 0.24s cubic-bezier(0.4, 0, 1, 1), opacity 0.18s ease-out, transform 0.18s ease-out';
        body.style.maxHeight = `${body.scrollHeight}px`;
        // Force reflow to ensure transition starts from current height.
        void body.offsetHeight;
        body.classList.add('collapsed');
        body.style.maxHeight = '0px';
    } else {
        body.style.transition = 'max-height 0.46s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.26s ease, transform 0.26s ease';
        body.classList.remove('collapsed');
        body.style.maxHeight = `${body.scrollHeight}px`;
        const onEnd = function(e) {
            if (e.propertyName === 'max-height' && !postsCollapsed) {
                body.style.maxHeight = 'none';
                body.style.transition = '';
                body.removeEventListener('transitionend', onEnd);
            }
        };
        body.addEventListener('transitionend', onEnd);
    }

    btn.innerText = postsCollapsed ? '展开帖子列表' : '收起帖子列表';
}

function togglePostsExpand() {
    const wasExpanded = postsExpanded;
    postsExpanded = !postsExpanded;
    renderPosts();
    if (wasExpanded) {
        const posts = document.getElementById('posts-section');
        if (posts) posts.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// 获取并显示帖子列表
async function fetchPosts() {
    try {
        const currentUser = localStorage.getItem('currentUser');
        
        // 发送请求，带上 user 参数，让后端帮我们算“已报名”状态
        const response = await fetch(`http://localhost:3000/api/posts?user=${encodeURIComponent(currentUser)}`);
        const data = await response.json();

        if (data.success) {
            allPosts = data.data || [];
            
            // 为每个帖子更新热度（每次浏览都计数）
            allPosts.forEach(post => {
                fetch(`http://localhost:3000/api/posts/${post.id}/view`, { method: 'PUT' }).catch(e => {});
            });
            
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
    const moreWrap = document.getElementById('posts-more-wrap');
    postsContainer.innerHTML = '';

    if (!allPosts || allPosts.length === 0) {
        postsContainer.innerHTML = '<p style="text-align:center; color:#9ca3af; padding: 40px;">目前还没有人发帖，快来抢沙发吧！</p>';
        if (moreWrap) moreWrap.innerHTML = '';
        return;
    }

    const filtered = applyFilters(allPosts);

    if (filtered.length === 0) {
        postsContainer.innerHTML = '<p style="text-align:center; color:#9ca3af; padding: 40px;">未找到匹配的帖子。</p>';
        if (moreWrap) moreWrap.innerHTML = '';
        return;
    }

    const currentUser = localStorage.getItem('currentUser');

    const postsToRender = postsExpanded ? filtered : filtered.slice(0, postsPreviewLimit);

    postsToRender.forEach(post => {
        const isMyPost = (post.author === currentUser);
        
        // 判断是否是"提供技能"类型
        const isSkillPost = (post.type === '提供技能');
        
        // 三重状态判断逻辑（仅对"寻人组队"适用）
        let actionBtn = '';
        if (isMyPost) {
            actionBtn = `<div style="display:flex; align-items:center; gap: 12px; white-space: nowrap">
                         <span style="color: #10b981; font-weight: bold; font-size: 14px;">(这是你的帖子)</span>
                         <button onclick="deletePost(${post.id})" class="btn-delete">🗑️ 删除</button>
                       </div>`;
        } else if (isSkillPost) {
            // 提供技能类型：根据是否已联系过显示不同按钮
            if (post.has_applied) {
                // 已经联系过了，显示继续聊天按钮
                actionBtn = `<button onclick="openChat('${post.author}', '${post.title.replace(/'/g, "\\'")}')" class="btn-apply">💬 继续聊天</button>`;
            } else {
                // 还没联系过，显示与我联系按钮
                actionBtn = `<button onclick="contactSkillProvider(${post.id})" class="btn-apply">💬 与我联系</button>`;
            }
        } else if (post.my_application_status === 'accepted') {
            actionBtn = `<button disabled class="btn-applied" style="color:#065f46; background:#d1fae5;">✅ 已通过入队</button>`;
        } else if (post.my_application_status === 'rejected') {
            actionBtn = `<button disabled class="btn-applied" style="color:#991b1b; background:#fee2e2;">❌ 已被拒绝</button>`;
        } else if (post.my_application_status === 'pending') {
            actionBtn = `<button disabled class="btn-applied" style="color:#92400e; background:#fef3c7;">🕒 审批中</button>`;
        } else if (post.project_status && post.project_status !== 'recruiting') {
            actionBtn = `<button disabled class="btn-applied">⛔ 招募已结束</button>`;
        } else {
            // 还没报名
            actionBtn = `<button onclick="applyForPost(${post.id})" class="btn-apply">✋ 我要报名</button>`;
        }

        // 构建有报酬标签（仅对"寻人组队"显示）
        let compensationTag = '';
        if (post.compensation && !isSkillPost) {
            compensationTag = `<span class="post-tag" style="background: #fecaca; color: #991b1b; margin-left: 8px;">💰 ${post.compensation}</span>`;
        }

        // 构建热度标签（简化版本，仅显示基础信息）
        let popularityBadge = '';
        if (post.popularity && post.popularity > 0) {
            let heatColor, heatLevel;
            if (post.popularity > 50) {
                heatColor = '#ef4444';
                heatLevel = '🔥 HOT';
            } else if (post.popularity > 20) {
                heatColor = '#f59e0b';
                heatLevel = '🌡️ WARM';
            } else {
                heatColor = '#8b5cf6';
                heatLevel = '👁️ NEW';
            }
            
            popularityBadge = `<span style="font-size: 13px; font-weight: bold; color: ${heatColor};">${heatLevel} (${post.popularity})</span>`;
        }

        // 🌟 构建已报名人数徽章（仅对"寻人组队"显示）
        let applicantBadge = '';
        if (!isSkillPost) {
            const applicantCount = post.applicant_count || 0;
            const acceptedCount = post.accepted_count || 0;
            applicantBadge = `
                <div style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #e0f2fe; border-radius: 8px; border: 1px solid #0ea5e9; margin-left: 12px;">
                    <span style="font-size: 14px; font-weight: bold; color: #0369a1;">👥</span>
                    <span style="font-size: 13px; font-weight: bold; color: #0369a1;">${applicantCount} 报名 / ${acceptedCount} 入队</span>
                </div>
            `;
        }

        const postHTML = `
            <div class="post-card" style="padding: 24px; background: white; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;">
                            <span class="post-tag" style="background: #dbeafe; color: #1e40af; padding: 6px 12px; border-radius: 4px; font-size: 13px; font-weight: bold;">${post.type || ''}</span>
                            ${compensationTag}
                        </div>
                        <h3 style="font-size: 18px; font-weight: 700; color: #1f2937; margin-bottom: 12px; line-height: 1.4;">${post.title}</h3>
                    </div>
                    <div style="flex-shrink: 0;">
                        ${applicantBadge}
                    </div>
                </div>
                <div style="font-size: 15px; color: #374151; line-height: 1.6; margin-bottom: 16px; word-break: break-word;">
                    ${post.content}
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px; padding-top: 16px; border-top: 1px solid #f3f4f6; flex-wrap: wrap;">
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 14px; color: #6b7280;">
                        <span>发布者: <a href="profile.html?user=${post.author}" style="color: #3b82f6; text-decoration: none; font-weight: bold;">${post.author}</a></span>
                        <span style="color: #9ca3af;">|</span>
                        <span style="color: #9ca3af;">${post.created_at || ''}</span>
                        ${popularityBadge ? '<span style="color: #9ca3af;">|</span>' + popularityBadge : ''}
                    </div>
                    ${actionBtn}
                </div>
            </div>
        `;
        postsContainer.innerHTML += postHTML;
    });

    if (moreWrap) {
        if (filtered.length > postsPreviewLimit) {
            const shown = postsToRender.length;
            const total = filtered.length;
            const remain = total - shown;
            const btnText = postsExpanded ? '收起更多' : `显示更多 (${remain})`;
            moreWrap.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; justify-content:center;">
                    <span style="font-size:12px; color:#64748b;">已显示 ${shown} / ${total}</span>
                    <button onclick="togglePostsExpand()" style="width:auto; padding:8px 14px; background:#f8fafc; color:#334155; border:1px solid #cbd5e1; border-radius:8px; font-size:13px;">${btnText}</button>
                </div>
            `;
        } else {
            moreWrap.innerHTML = '';
        }
    }
}

// 应用过滤器并返回新数组
function applyFilters(posts) {
    const text = (document.getElementById('filter-text')?.value || '').trim().toLowerCase();
    const type = (document.getElementById('filter-type')?.value || '');
    const compensation = (document.getElementById('filter-compensation')?.value || '');
    const sortBy = (document.getElementById('sort-by')?.value || 'newest');

    let result = posts.slice(); // 克隆数组

    if (text) {
        result = result.filter(p => ((p.title || '') + ' ' + (p.content || '')).toLowerCase().includes(text));
    }

    // 按帖子类型过滤
    if (type) {
        result = result.filter(p => p.type === type);
    }

    if (compensation) {
        // 简化为两个选项：free (无报酬) 或 paid (有报酬)
        // 注意：提供技能类型的帖子不显示报酬，所以过滤时不会包含有报酬的提供技能帖子
        if (compensation === 'free') {
            result = result.filter(p => !p.compensation);
        } else if (compensation === 'paid') {
            result = result.filter(p => p.compensation && p.compensation.length > 0);
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
    postsExpanded = false;
    if (document.getElementById('filter-text')) document.getElementById('filter-text').value = '';
    if (document.getElementById('filter-type')) document.getElementById('filter-type').value = '';
    if (document.getElementById('filter-compensation')) document.getElementById('filter-compensation').value = '';
    if (document.getElementById('sort-by')) document.getElementById('sort-by').value = 'newest';
    renderPosts();
}

// 在页面加载后给过滤控件绑定事件（实时过滤）
window.addEventListener('DOMContentLoaded', () => {
    ['filter-text','filter-type','filter-compensation','sort-by'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
            postsExpanded = false;
            renderPosts();
        });
    });

    const rightEntry = document.getElementById('right-center-entry');
    if (rightEntry) {
        rightEntry.style.setProperty('--entry-drift-y', '0px');
        rightEntry.style.setProperty('--entry-trail-offset', '0px');
        rightEntry.style.setProperty('--entry-trail-opacity', '0');

        let driftY = 0;
        let driftVelocity = 0;
        let targetDriftY = 0;
        let displayTrailOffset = 0;
        let targetTrailOffset = 0;
        let displayTrailOpacity = 0;
        let targetTrailOpacity = 0;
        let prevY = window.scrollY;
        let prevTs = performance.now();
        let rafId = null;

        const clamp = (num, min, max) => Math.max(min, Math.min(max, num));

        const animateEntry = () => {
            const driftForce = (targetDriftY - driftY) * 0.09;
            driftVelocity = (driftVelocity + driftForce) * 0.76;
            driftY += driftVelocity;

            displayTrailOffset += (targetTrailOffset - displayTrailOffset) * 0.22;
            displayTrailOpacity += (targetTrailOpacity - displayTrailOpacity) * 0.18;

            targetDriftY *= 0.9;
            targetTrailOffset *= 0.82;
            targetTrailOpacity *= 0.84;

            rightEntry.style.setProperty('--entry-drift-y', `${driftY.toFixed(2)}px`);
            rightEntry.style.setProperty('--entry-trail-offset', `${displayTrailOffset.toFixed(2)}px`);
            rightEntry.style.setProperty('--entry-trail-opacity', `${displayTrailOpacity.toFixed(3)}`);

            if (
                Math.abs(driftY) < 0.04 &&
                Math.abs(driftVelocity) < 0.04 &&
                Math.abs(targetDriftY) < 0.04 &&
                Math.abs(displayTrailOffset) < 0.04 &&
                Math.abs(targetTrailOffset) < 0.04 &&
                displayTrailOpacity < 0.01 &&
                targetTrailOpacity < 0.01
            ) {
                rightEntry.style.setProperty('--entry-drift-y', '0px');
                rightEntry.style.setProperty('--entry-trail-offset', '0px');
                rightEntry.style.setProperty('--entry-trail-opacity', '0');
                rafId = null;
                return;
            }

            rafId = requestAnimationFrame(animateEntry);
        };

        const onScrollTail = () => {
            const now = performance.now();
            const dy = window.scrollY - prevY;
            const dt = Math.max(1, now - prevTs);
            const speed = Math.abs(dy) / dt;

            prevY = window.scrollY;
            prevTs = now;

            if (dy === 0) return;

            const direction = dy > 0 ? 1 : -1;
            const driftAmplitude = clamp(0.35 + speed * 4.8, 0.35, 1.8);
            const trailAmplitude = clamp(4.8 + speed * 48, 4.8, 26);

            // 按钮轻微惯性滑动 + 残影增强。
            targetDriftY = clamp(direction * driftAmplitude, -1.8, 1.8);
            targetTrailOffset = clamp(direction * trailAmplitude, -26, 26);
            targetTrailOpacity = clamp(0.18 + speed * 0.9, 0.18, 0.68);

            if (!rafId) rafId = requestAnimationFrame(animateEntry);
        };

        window.addEventListener('scroll', onScrollTail, { passive: true });
    }

    updateQuickNavActive();
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

// 🌟 【新增：与技能提供者联系】
async function contactSkillProvider(postId) {
    const contactName = localStorage.getItem('currentUser');
    
    // 打开输入框让用户输入联系留言
    const message = prompt('请输入你的联系留言 (例如：我需要学习编程，有时间吗？)：');
    
    // 如果用户点了取消，或者什么都没填
    if (message === null) return; 
    if (message.trim() === '') {
        alert('留言不能为空哦！');
        return;
    }

    // 把联系请求数据发给后端（使用同样的 /api/apply 接口）
    try {
        const response = await fetch('http://localhost:3000/api/apply', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                post_id: postId, 
                applicant_name: contactName, 
                message: message 
            })
        });
        
        const data = await response.json();

        if (data.success) {
            alert('🎉 ' + data.message);
            // 联系成功后，重新拉取帖子
            fetchPosts();
        } else {
            alert('联系失败：' + data.message);
        }
    } catch (error) {
        alert('网络错误，无法提交联系请求！');
    }
}

async function openInbox() {
    // 1. 显示弹窗 (把 display 从 none 变成 flex，让它居中显示)
    document.getElementById('inbox-modal').style.display = 'flex';
    const messagesContainer = document.getElementById('inbox-messages');
    messagesContainer.innerHTML = '<p>正在疯狂拉取消息中...</p>';

    const currentUser = localStorage.getItem('currentUser');

    try {
        // 2. 向后端请求属于我的消息 (注意 URL 后面带了 ?user=xxx)
        const response = await fetch(`http://localhost:3000/api/my-messages?user=${encodeURIComponent(currentUser)}`);
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
                const isTeamRecruit = msg.type === '寻人组队';
                const isPending = msg.status === 'pending';
                const statusText = msg.status === 'accepted' ? '已通过' : (msg.status === 'rejected' ? '已拒绝' : '待处理');
                const statusColor = msg.status === 'accepted' ? '#059669' : (msg.status === 'rejected' ? '#dc2626' : '#d97706');
                const decisionBtns = (isTeamRecruit && isPending)
                    ? `
                        <button onclick="decideApplication(${msg.application_id}, 'accepted')" style="width:auto; white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border-radius:6px; background:#10b981; color:white; border:none; cursor:pointer; font-size:13px; line-height:1;">通过入队</button>
                        <button onclick="decideApplication(${msg.application_id}, 'rejected')" style="width:auto; white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border-radius:6px; background:#ef4444; color:white; border:none; cursor:pointer; font-size:13px; line-height:1;">拒绝</button>
                    `
                    : '';

                const msgHTML = `
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #3b82f6; display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                            <p style="font-size: 14px; color: #6b7280; margin: 0;">
                                <a href="profile.html?user=${msg.applicant_name}" style="color: #3b82f6; text-decoration: none; font-weight: bold;">${msg.applicant_name}</a> 申请了你的帖子: <span style="color: #1f2937;">《${msg.title}》</span>
                            </p>
                            <div style="display:flex; gap:8px; align-items:center; flex-wrap:nowrap; white-space:nowrap;">
                                ${decisionBtns}
                                <button onclick="openChat('${msg.applicant_name}','${msg.title.replace(/'/g,"\\'")}' )" style="width:auto; white-space:nowrap; display:inline-flex; align-items:center; justify-content:center; padding:6px 10px; border-radius:6px; background:#3b82f6; color:white; border:none; cursor:pointer; font-size:13px; line-height:1;">私信</button>
                            </div>
                        </div>
                        <p style="margin:0; font-size:12px; color:${statusColor}; font-weight:700;">审批状态：${statusText}</p>
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
    
    // 防止重复发送
    if (window._isSending) return;
    window._isSending = true;
    
    const currentUser = localStorage.getItem('currentUser');
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
            // 立即把消息推到界面上
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

// 🌟 【新增：切换下拉菜单时，动态改变提示词】
function updatePlaceholders() {
    const type = document.getElementById('post-type').value;
    const titleInput = document.getElementById('post-title');
    const contentInput = document.getElementById('post-content');
    const compensationSection = document.getElementById('compensation-section');

    if (type === '寻人组队') {
        titleInput.placeholder = "一句话概括你的需求 (如：急寻一名会弹吉他的同学迎新晚会伴奏)";
        contentInput.placeholder = "详细描述一下任务时间、地点、要求或可能愿意提供的报酬...";
        compensationSection.style.display = 'flex'; // 显示报酬部分
    } else if (type === '提供技能') {
        titleInput.placeholder = "一句话概括你能做什么 (如：精通什么编程语言/海报设计/视频剪辑)";
        contentInput.placeholder = "详细描述一下你的技能水平、空闲时间以及可能会存在的期望报酬...";
        compensationSection.style.display = 'none'; // 隐藏报酬部分
        // 清空报酬数据
        document.getElementById('post-compensation').checked = false;
        document.getElementById('post-amount').value = '';
        document.getElementById('post-amount').style.display = 'none';
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

async function decideApplication(applicationId, decision) {
    const currentUser = localStorage.getItem('currentUser');
    try {
        const response = await fetch(`http://localhost:3000/api/applications/${applicationId}/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ owner: currentUser, decision })
        });
        const data = await response.json();
        if (!data.success) {
            alert(data.message || '审批失败');
            return;
        }
        alert(data.message || '审批完成');
        openInbox();
        fetchPosts();
        loadMyProjects();
    } catch (err) {
        alert('网络错误，审批失败');
    }
}

let myProjects = [];
let activeProjectId = null;

function statusLabel(status) {
    if (status === 'recruiting') return '招募中';
    if (status === 'executing') return '执行中';
    if (status === 'completed') return '已结项';
    return status || '未知';
}

async function loadMyProjects() {
    return loadProjectPreviews();
}

function renderProjectList() {
    const box = document.getElementById('my-projects-list');
    if (!box) return;

    if (!myProjects.length) {
        box.innerHTML = '<p style="color:#9ca3af; font-size:14px;">暂无项目记录</p>';
        return;
    }

    box.innerHTML = '';
    myProjects.forEach((project) => {
        const el = document.createElement('div');
        el.className = 'project-mini-card' + (project.id === activeProjectId ? ' active' : '');
        el.innerHTML = `
            <div style="font-weight:700; color:#1f2937; margin-bottom:6px;">${project.title}</div>
            <div style="font-size:12px; color:#6b7280; margin-bottom:4px;">状态：${statusLabel(project.status)}</div>
            <div style="font-size:12px; color:#6b7280;">成员 ${project.member_count} | 待办里程碑 ${project.pending_milestones}</div>
        `;
        el.onclick = async function() {
            activeProjectId = project.id;
            renderProjectList();
            await loadProjectDetail(project.id);
        };
        box.appendChild(el);
    });
}

function renderLifecycle(status) {
    const steps = [
        { key: 'initiated', text: '发起' },
        { key: 'recruiting', text: '招募' },
        { key: 'executing', text: '执行' },
        { key: 'completed', text: '结项' }
    ];
    const activeIndex = steps.findIndex((s) => s.key === status);

    return `<div class="lifecycle-track">${steps.map((step, index) => {
        const active = index <= activeIndex ? ' active' : '';
        return `<span class="life-step${active}">${step.text}</span>`;
    }).join('')}</div>`;
}

async function loadProjectDetail(projectId) {
    const currentUser = localStorage.getItem('currentUser');
    const panel = document.getElementById('project-detail-panel');
    if (!panel) return;

    panel.innerHTML = '<p style="color:#9ca3af;">正在加载项目详情...</p>';

    try {
        const response = await fetch(`http://localhost:3000/api/projects/${projectId}/overview?user=${encodeURIComponent(currentUser)}`);
        const data = await response.json();
        if (!data.success) {
            panel.innerHTML = `<p style="color:#ef4444;">${data.message || '加载失败'}</p>`;
            return;
        }

        const detail = data.data;
        const project = detail.project;
        const checkins = detail.recent_checkins || [];
        const events = detail.recent_events || [];
        const canManage = detail.can_manage;

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                <h3 style="margin:0; font-size:18px; color:#111827;">${project.title}</h3>
                <span style="font-size:12px; color:#374151; background:#e5e7eb; border-radius:999px; padding:6px 10px;">${statusLabel(project.status)}</span>
            </div>

            ${renderLifecycle(project.status)}

            <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
                ${canManage ? `
                    <button onclick="changeProjectStatus(${project.id}, 'recruiting')" style="width:auto; padding:6px 10px; font-size:12px; background:#e5e7eb; color:#111827;">设为招募</button>
                    <button onclick="changeProjectStatus(${project.id}, 'executing')" style="width:auto; padding:6px 10px; font-size:12px; background:#2563eb; color:#fff;">进入执行</button>
                    <button onclick="changeProjectStatus(${project.id}, 'completed')" style="width:auto; padding:6px 10px; font-size:12px; background:#111827; color:#fff;">结项</button>
                ` : '<span style="font-size:12px; color:#6b7280;">仅队长可切换项目阶段</span>'}
            </div>

            <div style="margin-bottom:14px;">
                <strong style="display:block; margin-bottom:6px;">流程概览</strong>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <span style="font-size:12px; background:#eef2ff; color:#1e3a8a; padding:4px 8px; border-radius:999px;">成员 ${detail.member_count}</span>
                    <span style="font-size:12px; background:#ecfeff; color:#155e75; padding:4px 8px; border-radius:999px;">里程碑 ${detail.milestone_completed}/${detail.milestone_total}</span>
                    <span style="font-size:12px; background:#fef9c3; color:#854d0e; padding:4px 8px; border-radius:999px;">待处理反馈 ${detail.open_feedback}</span>
                </div>
            </div>

            <div style="margin-bottom:14px;">
                <strong style="display:block; margin-bottom:6px;">快速打卡</strong>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                    <input id="checkin-note" type="text" placeholder="今天完成了什么？" style="flex:1; min-width:220px; padding:8px; margin:0;" />
                    <input id="checkin-completion" type="number" min="0" max="100" placeholder="完成度(0-100)" style="width:160px; padding:8px; margin:0;" />
                    <button onclick="submitCheckin(${project.id})" style="width:auto; padding:8px 12px; font-size:12px;">提交打卡</button>
                </div>
                <div style="max-height:160px; overflow:auto; background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:8px;">
                    ${checkins.length ? checkins.map((c) => `<div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; font-size:12px; color:#374151; padding:6px 0; border-bottom:1px dashed #e5e7eb;"><div><strong>${c.user_name}</strong> (${c.task_completion}%)：${c.progress_note || '无'} <span style="color:#9ca3af;">${c.created_at}</span></div>${canManage ? `<button onclick="deleteProjectCheckin(${project.id}, ${c.id})" style="width:auto; padding:4px 8px; font-size:11px; background:#fef2f2; color:#b91c1c; border:1px solid #fecaca; border-radius:6px;">删除</button>` : ''}</div>`).join('') : '<span style="font-size:12px; color:#9ca3af;">暂无打卡记录</span>'}
                </div>
            </div>

            <div>
                <strong style="display:block; margin-bottom:6px;">最近监督事件</strong>
                <div style="max-height:140px; overflow:auto; background:#fff; border:1px solid #e5e7eb; border-radius:8px; padding:8px; margin-bottom:10px;">
                    ${events.length ? events.map((e) => `<div style="font-size:12px; color:#334155; padding:6px 0; border-bottom:1px dashed #e5e7eb;"><strong>[${e.severity || 'medium'}]</strong> ${e.title} · ${e.actor || '系统'} <span style="color:#94a3b8;">${e.created_at}</span></div>`).join('') : '<span style="font-size:12px; color:#9ca3af;">暂无监督事件</span>'}
                </div>
                <button onclick="openFullTeamCenter(${project.id})" style="width:auto; padding:8px 12px; font-size:12px; background:#0f172a; color:#fff;">进入完整团队管理与监督反馈</button>
            </div>
        `;
    } catch (err) {
        panel.innerHTML = '<p style="color:#ef4444;">网络错误，加载失败</p>';
    }
}

async function changeProjectStatus(projectId, status) {
    const currentUser = localStorage.getItem('currentUser');
    try {
        const response = await fetch(`http://localhost:3000/api/projects/${projectId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser, status })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || '状态更新失败');
        await loadMyProjects();
    } catch (err) {
        alert('网络错误，状态更新失败');
    }
}

async function submitCheckin(projectId) {
    const currentUser = localStorage.getItem('currentUser');
    const note = document.getElementById('checkin-note')?.value?.trim() || '';
    const completion = document.getElementById('checkin-completion')?.value;

    try {
        const response = await fetch(`http://localhost:3000/api/projects/${projectId}/checkins`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser, progress_note: note, task_completion: Number(completion) })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || '打卡失败');
        await loadProjectDetail(projectId);
        await loadProjectPreviews();
    } catch (err) {
        alert('网络错误，打卡失败');
    }
}

async function deleteProjectCheckin(projectId, checkinId) {
    const currentUser = localStorage.getItem('currentUser');
    if (!confirm('确定删除这条打卡记录吗？')) return;

    try {
        const response = await fetch(`http://localhost:3000/api/projects/${projectId}/checkins/${checkinId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ actor: currentUser })
        });
        const data = await response.json();
        if (!data.success) return alert(data.message || '删除失败');
        await loadProjectDetail(projectId);
        await loadProjectPreviews();
    } catch (err) {
        alert('网络错误，删除失败');
    }
}

async function loadProjectPreviews() {
    const currentUser = localStorage.getItem('currentUser');
    if (!currentUser) return;

    try {
        const response = await fetch(`http://localhost:3000/api/projects-preview?user=${encodeURIComponent(currentUser)}`);
        const data = await response.json();
        if (!data.success) return;
        myProjects = data.data || [];
        renderProjectList();

        if (myProjects.length > 0) {
            const target = myProjects.find((p) => p.id === activeProjectId) || myProjects[0];
            activeProjectId = target.id;
            await loadProjectDetail(activeProjectId);
        } else {
            document.getElementById('project-detail-panel').innerHTML = '<p style="color:#9ca3af; font-size:14px;">你还没有加入任何团队项目。</p>';
        }
    } catch (err) {
        console.error('加载项目预览失败', err);
    }
}

function openFullTeamCenter(projectId) {
    if (projectId) {
        window.location.href = `team_management.html?project=${projectId}`;
        return;
    }
    if (activeProjectId) {
        window.location.href = `team_management.html?project=${activeProjectId}`;
        return;
    }
    window.location.href = 'team_management.html';
}