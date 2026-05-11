window.onload = function() {
    const currentUser = localStorage.getItem('currentUser');

    if (!currentUser) {
        alert('请先登录！');
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('welcome-text').innerText = `👋 欢迎, ${currentUser}!`;
    updateManagementEntryVisibility(false);
    renderSimpleHomeFlow(0);
    renderLabelPickers();
    updatePlaceholders();

    fetchPosts();
    loadRecommendations();
    loadMyProjects();
    
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
    syncCustomLabelInputWidth();

    updateQuickNavActive();
};

function logout() {
    localStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}

async function createPost() {
    const title = document.getElementById('post-title').value;
    const content = document.getElementById('post-content').value;
    const labels = selectedPostLabel ? [selectedPostLabel] : [];
    const customLabel = (document.getElementById('post-custom-label')?.value || '').trim();
    const acceptCrossCampus = document.getElementById('post-cross-campus').checked;
    const requiresManagement = document.getElementById('post-requires-management')?.checked || false;
    const author = localStorage.getItem('currentUser');
    
    if (title === '' || content === '') {
        alert('标题和内容不能为空！');
        return;
    }
    if (!selectedPostLabel) {
        alert('请选择一个标签');
        return;
    }
    if (selectedPostLabel === '自定义') {
        if (!customLabel) {
            alert('请输入自定义标签');
            return;
        }
        if (customLabel.length > 12) {
            alert('自定义标签最多 12 个字符');
            return;
        }
    }

    let hasCompensation = false;
    let amount = '';
    
    hasCompensation = document.getElementById('post-compensation').checked;
    amount = document.getElementById('post-amount').value.trim();
    if (hasCompensation && amount === '') {
        alert('请输入报酬金额！');
        return;
    }
    try {
        const response = await fetch('http://localhost:3000/api/posts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                author, 
                title, 
                content, 
                labels,
                custom_label: customLabel,
                location: '', 
                compensation: hasCompensation ? amount : '',
                accept_cross_campus: acceptCrossCampus,
                requires_management: requiresManagement
            })
        });
        const data = await response.json();

        if (data.success) {
            alert('发布成功！');
            document.getElementById('post-title').value = '';
            document.getElementById('post-content').value = '';
            document.getElementById('post-compensation').checked = false;
            document.getElementById('post-amount').value = '';
            document.getElementById('post-amount').style.display = 'none';
            document.getElementById('post-cross-campus').checked = false;
            selectedPostLabel = '寻人组队';
            if (document.getElementById('post-custom-label')) document.getElementById('post-custom-label').value = '';
            renderLabelPickers();
            if (document.getElementById('post-requires-management')) {
                document.getElementById('post-requires-management').checked = false;
            }
            updatePlaceholders();
            fetchPosts();
            loadRecommendations();
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
const POST_LABEL_OPTIONS = ['寻人组队', '提供技能', '自定义'];
let selectedPostLabel = '寻人组队';
let smartSearchState = { query: '', orderedIds: [], scoreMap: new Map() };
let smartSearchReqToken = 0;
let smartSearchDebounceTimer = null;

function normalizePostLabels(post) {
    if (!post) return [];
    if (Array.isArray(post.post_labels)) return post.post_labels.filter(Boolean);
    if (typeof post.post_labels === 'string') {
        try {
            const parsed = JSON.parse(post.post_labels);
            if (Array.isArray(parsed)) return parsed.filter(Boolean);
        } catch (e) {
            return post.post_labels.split(/[,，、]/).map((x) => x.trim()).filter(Boolean);
        }
    }
    return [];
}

function labelChipHtml(label, selected, onClick) {
    const bg = selected ? '#dbeafe' : '#f8fafc';
    const color = selected ? '#1d4ed8' : '#334155';
    const border = selected ? '#93c5fd' : '#cbd5e1';
    return `<button type="button" onclick="${onClick}" style="width:auto; padding:6px 10px; border-radius:999px; border:1px solid ${border}; background:${bg}; color:${color}; font-size:12px; cursor:pointer;"># ${label}</button>`;
}

function renderLabelPickers() {
    const postBox = document.getElementById('post-label-picker');
    if (postBox) {
        const currentValue = document.getElementById('post-custom-label')?.value || '';
        let chips = POST_LABEL_OPTIONS
            .map((label) => labelChipHtml(label, selectedPostLabel === label, `togglePostLabel('${label}')`))
            .join('');
        if (selectedPostLabel === '自定义') {
            chips += `
                <input
                    type="text"
                    id="post-custom-label"
                    maxlength="12"
                    placeholder="输入自定义标签"
                    oninput="syncCustomLabelInputWidth()"
                    style="width:108px; min-width:108px; max-width:320px; padding:6px 10px; margin:0; border-radius:999px; border:1px solid #93c5fd; box-sizing:border-box; font-size:12px; line-height:1.2; background:#dbeafe; color:#1d4ed8; transition:width .16s ease;"
                />
            `;
        }
        postBox.innerHTML = chips;
        if (selectedPostLabel === '自定义') {
            const input = document.getElementById('post-custom-label');
            if (input) input.value = currentValue;
        }
        syncCustomLabelInputWidth();
    }
}

function measureChipInputWidth(text) {
    if (!window._customTagInputMeasureCtx) {
        const canvas = document.createElement('canvas');
        window._customTagInputMeasureCtx = canvas.getContext('2d');
    }
    const ctx = window._customTagInputMeasureCtx;
    ctx.font = '12px "Segoe UI", sans-serif';
    return Math.ceil(ctx.measureText(String(text || '')).width);
}

function syncCustomLabelInputWidth() {
    const customLabelInput = document.getElementById('post-custom-label');
    if (!customLabelInput) return;
    const raw = String(customLabelInput.value || '');
    const placeholder = customLabelInput.placeholder || '';
    const measureText = raw.length ? raw : placeholder;
    const textWidth = measureChipInputWidth(measureText);
    const dynamicWidth = Math.max(108, Math.min(320, textWidth + 32));
    customLabelInput.style.width = `${dynamicWidth}px`;
}

function togglePostLabel(label) {
    selectedPostLabel = label;
    renderLabelPickers();
    updatePlaceholders();
}

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
    const postsEl = document.getElementById('posts-section');
    const teamEl = document.getElementById('team-center-section');
    const viewportMark = window.innerHeight * 0.3;
    const scrollHeight = document.documentElement.scrollHeight;
    const maxScrollY = Math.max(0, scrollHeight - window.innerHeight);
    const clampedScrollY = Math.max(0, Math.min(window.scrollY, maxScrollY));
    let active = null;
    let indicatorPercent = 0;

    if (topEl && postsEl && teamEl) {
        const topY = topEl.getBoundingClientRect().top + window.scrollY;
        const postsY = postsEl.getBoundingClientRect().top + window.scrollY;
        const teamY = teamEl.getBoundingClientRect().top + window.scrollY;

        // 用同一套阈值控制“激活态”和“进度位置”，避免显示不同步。
        const topTriggerY = Math.max(0, topY);
        const postsTriggerY = Math.max(topTriggerY, postsY - viewportMark);
        const teamTriggerY = Math.min(
            maxScrollY,
            Math.max(postsTriggerY + 1, teamY - viewportMark)
        );

        const indicator = document.getElementById('quick-progress-indicator');
        if (indicator) {
            if (clampedScrollY <= postsTriggerY) {
                const d1 = Math.max(1, postsTriggerY - topTriggerY);
                indicatorPercent = ((clampedScrollY - topTriggerY) / d1) * 50;
            } else {
                const d2 = Math.max(1, teamTriggerY - postsTriggerY);
                indicatorPercent = 50 + ((clampedScrollY - postsTriggerY) / d2) * 50;
            }
            indicatorPercent = Math.max(0, Math.min(100, indicatorPercent));
            indicator.style.top = `${indicatorPercent}%`;
        }

        // 仅在指示器“碰到节点”时点亮对应节点。
        const indicatorRect = indicator?.getBoundingClientRect();
        if (indicatorRect) {
            const indicatorCenterY = indicatorRect.top + indicatorRect.height / 2;
            const touchTolerance = Math.max(indicatorRect.height * 0.45, 10);
            let bestDist = Number.POSITIVE_INFINITY;

            ['top', 'posts', 'team'].forEach((key) => {
                const dot = document.querySelector(`#nav-${key} .quick-nav-dot`);
                if (!dot) return;
                const dotRect = dot.getBoundingClientRect();
                const dotCenterY = dotRect.top + dotRect.height / 2;
                const dist = Math.abs(dotCenterY - indicatorCenterY);
                if (dist <= touchTolerance && dist < bestDist) {
                    bestDist = dist;
                    active = key;
                }
            });
        }
    }

    ['top', 'posts', 'team'].forEach((key) => {
        const el = document.getElementById(`nav-${key}`);
        if (!el) return;
        if (key === active) el.classList.add('active');
        else el.classList.remove('active');
    });
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
        const labels = normalizePostLabels(post);
        const primaryLabel = labels[0] || post.type || '';
        
        // 判断是否是"提供技能"类型
        const isSkillPost = (post.type === '提供技能') || primaryLabel === '提供技能';
        
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

        const postCampus = post.campus || '';
        const modeTag = Number(post.accept_cross_campus || 0) === 1
            ? `<span class="post-tag" style="background: #dcfce7; color: #166534;">🌍 可跨校区</span>`
            : (postCampus
                ? `<span class="post-tag" style="background: #f1f5f9; color: #334155;">📍 同校区优先 · ${postCampus}</span>`
                : '');
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

        const labelChips = primaryLabel
            ? `<span class="post-tag" style="background:#eef2ff; color:#3730a3; padding:6px 10px; border-radius:999px; font-size:12px;">#${primaryLabel}</span>`
            : '';

        const postHTML = `
            <div class="post-card" style="padding: 24px; background: white; border-radius: 8px; border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 16px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px;">
                            ${labelChips}
                            ${compensationTag}
                            ${modeTag}
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
    const text = (document.getElementById('filter-text')?.value || '').trim();
    const scope = (document.getElementById('filter-scope')?.value || 'all');
    const compensationFilter = (document.getElementById('filter-compensation')?.value || 'all');
    const sortBy = (document.getElementById('sort-by')?.value || 'newest');
    const currentUser = localStorage.getItem('currentUser');

    let result = posts.slice(); // 克隆数组

    if (text) {
        const normalizedQuery = text.toLowerCase();
        if (smartSearchState.query === normalizedQuery && smartSearchState.orderedIds.length) {
            const allowed = new Set(smartSearchState.orderedIds);
            result = result.filter((p) => allowed.has(p.id));
            result.sort((a, b) => (smartSearchState.scoreMap.get(b.id) || 0) - (smartSearchState.scoreMap.get(a.id) || 0));
        } else {
            const queryTokens = normalizedQuery.split(/\s+/).filter(Boolean);
            result = result.filter((p) => {
                const labels = normalizePostLabels(p).join(' ');
                const haystack = `${p.title || ''} ${p.content || ''} ${labels}`.toLowerCase();
                if (haystack.includes(normalizedQuery)) return true;
                if (!queryTokens.length) return true;
                const hitCount = queryTokens.filter((token) => haystack.includes(token)).length;
                return hitCount >= Math.max(1, Math.ceil(queryTokens.length * 0.6));
            });
        }
    }

    if (scope === 'mine') {
        result = result.filter((p) => p.author === currentUser);
    }

    if (compensationFilter === 'paid') {
        result = result.filter((p) => String(p.compensation || '').trim() !== '');
    } else if (compensationFilter === 'unpaid') {
        result = result.filter((p) => String(p.compensation || '').trim() === '');
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
    if (document.getElementById('filter-scope')) document.getElementById('filter-scope').value = 'all';
    if (document.getElementById('filter-compensation')) document.getElementById('filter-compensation').value = 'all';
    if (document.getElementById('sort-by')) document.getElementById('sort-by').value = 'newest';
    smartSearchState = { query: '', orderedIds: [], scoreMap: new Map() };
    renderPosts();
}

async function requestSmartSearch(text) {
    const query = String(text || '').trim();
    const normalizedQuery = query.toLowerCase();
    if (!normalizedQuery) {
        smartSearchState = { query: '', orderedIds: [], scoreMap: new Map() };
        renderPosts();
        return;
    }
    const token = ++smartSearchReqToken;
    const currentUser = localStorage.getItem('currentUser') || '';
    try {
        const res = await fetch(`http://localhost:3000/api/posts/search-ai?q=${encodeURIComponent(query)}&user=${encodeURIComponent(currentUser)}&limit=120`);
        const json = await res.json();
        if (token !== smartSearchReqToken) return;
        if (json.success && Array.isArray(json.data)) {
            const orderedIds = [];
            const scoreMap = new Map();
            json.data.forEach((item) => {
                if (!item || typeof item.id === 'undefined') return;
                orderedIds.push(item.id);
                scoreMap.set(item.id, Number(item.score || 0));
            });
            smartSearchState = { query: normalizedQuery, orderedIds, scoreMap };
        } else {
            smartSearchState = { query: normalizedQuery, orderedIds: [], scoreMap: new Map() };
        }
        renderPosts();
    } catch (error) {
        if (token !== smartSearchReqToken) return;
        smartSearchState = { query: normalizedQuery, orderedIds: [], scoreMap: new Map() };
        renderPosts();
    }
}

// 在页面加载后给过滤控件绑定事件（实时过滤）
window.addEventListener('DOMContentLoaded', () => {
    ['filter-scope','filter-compensation','sort-by'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            const trigger = () => {
                postsExpanded = false;
                renderPosts();
            };
            el.addEventListener('input', trigger);
            el.addEventListener('change', trigger);
        }
    });
    const textFilter = document.getElementById('filter-text');
    if (textFilter) {
        const onType = () => {
            postsExpanded = false;
            if (smartSearchDebounceTimer) clearTimeout(smartSearchDebounceTimer);
            smartSearchDebounceTimer = setTimeout(() => {
                requestSmartSearch(textFilter.value);
            }, 220);
            renderPosts();
        };
        textFilter.addEventListener('input', onType);
        textFilter.addEventListener('change', onType);
    }

    const rightEntries = Array.from(document.querySelectorAll('.right-center-entry'));
    if (rightEntries.length) {
        rightEntries.forEach((entry) => {
            entry.style.setProperty('--entry-drift-y', '0px');
            entry.style.setProperty('--entry-trail-offset', '0px');
            entry.style.setProperty('--entry-trail-opacity', '0');
            entry.style.setProperty('--entry-tilt-x', '0deg');
            entry.style.setProperty('--entry-tilt-y', '0deg');
            entry.style.setProperty('--entry-spot-x', '50%');
            entry.style.setProperty('--entry-spot-y', '50%');
            entry.style.setProperty('--entry-spot-alpha', '0');

            entry.addEventListener('pointermove', (e) => {
                const rect = entry.getBoundingClientRect();
                if (!rect.width || !rect.height) return;

                const px = (e.clientX - rect.left) / rect.width;
                const py = (e.clientY - rect.top) / rect.height;
                const tiltY = (px - 0.5) * 7.2;
                const tiltX = (0.5 - py) * 7.2;

                entry.style.setProperty('--entry-tilt-x', `${tiltX.toFixed(2)}deg`);
                entry.style.setProperty('--entry-tilt-y', `${tiltY.toFixed(2)}deg`);
                entry.style.setProperty('--entry-spot-x', `${(px * 100).toFixed(2)}%`);
                entry.style.setProperty('--entry-spot-y', `${(py * 100).toFixed(2)}%`);
                entry.style.setProperty('--entry-spot-alpha', '1');
            });

            entry.addEventListener('pointerleave', () => {
                entry.style.setProperty('--entry-tilt-x', '0deg');
                entry.style.setProperty('--entry-tilt-y', '0deg');
                entry.style.setProperty('--entry-spot-x', '50%');
                entry.style.setProperty('--entry-spot-y', '50%');
                entry.style.setProperty('--entry-spot-alpha', '0');
            });
        });

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

        const applyToEntries = (prop, value) => {
            rightEntries.forEach((entry) => entry.style.setProperty(prop, value));
        };

        const animateEntry = () => {
            const driftForce = (targetDriftY - driftY) * 0.09;
            driftVelocity = (driftVelocity + driftForce) * 0.76;
            driftY += driftVelocity;

            displayTrailOffset += (targetTrailOffset - displayTrailOffset) * 0.22;
            displayTrailOpacity += (targetTrailOpacity - displayTrailOpacity) * 0.18;

            targetDriftY *= 0.9;
            targetTrailOffset *= 0.82;
            targetTrailOpacity *= 0.84;

            applyToEntries('--entry-drift-y', `${driftY.toFixed(2)}px`);
            applyToEntries('--entry-trail-offset', `${displayTrailOffset.toFixed(2)}px`);
            applyToEntries('--entry-trail-opacity', `${displayTrailOpacity.toFixed(3)}`);

            if (
                Math.abs(driftY) < 0.04 &&
                Math.abs(driftVelocity) < 0.04 &&
                Math.abs(targetDriftY) < 0.04 &&
                Math.abs(displayTrailOffset) < 0.04 &&
                Math.abs(targetTrailOffset) < 0.04 &&
                displayTrailOpacity < 0.01 &&
                targetTrailOpacity < 0.01
            ) {
                applyToEntries('--entry-drift-y', '0px');
                applyToEntries('--entry-trail-offset', '0px');
                applyToEntries('--entry-trail-opacity', '0');
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

function updatePlaceholders() {
    const titleInput = document.getElementById('post-title');
    const contentInput = document.getElementById('post-content');
    const compensationSection = document.getElementById('compensation-section');
    const managementSection = document.getElementById('management-section');
    if (selectedPostLabel === '提供技能') {
        titleInput.placeholder = '你能提供什么支持？';
        contentInput.placeholder = '写明可提供的支持内容、可参与时段、协作方式和边界';
    } else if (selectedPostLabel === '自定义') {
        titleInput.placeholder = '给你的活动起一个清晰标题';
        contentInput.placeholder = '描述一下吧';
    } else {
        titleInput.placeholder = '你希望招募什么角色？';
        contentInput.placeholder = '写明活动目标、需要的角色、时间安排和协作要求';
    }
    compensationSection.style.display = 'flex';
    if (managementSection) managementSection.style.display = 'block';
}

async function deletePost(postId) {
    if (!confirm('确定要删除这个帖子吗？删除后不可恢复哦！')) {
        return; 
    }

    const currentUser = localStorage.getItem('currentUser');

    try {
        const response = await fetch(`http://localhost:3000/api/posts/${postId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ author: currentUser })
        });

        const data = await response.json();

        if (data.success) {
            alert('🗑️ 删除成功！');
            fetchPosts();
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
            <div style="font-size:12px; color:#6b7280;">成员 ${project.member_count} | 最近有打卡 ${project.recent_checkin ? '是' : '否'}</div>
        `;
        el.onclick = async function() {
            activeProjectId = project.id;
            renderProjectList();
            await loadProjectDetail(project.id);
        };
        box.appendChild(el);
    });
}

function updateManagementEntryVisibility(hasManagedProject) {
    const teamGrid = document.getElementById('team-management-grid');
    const rightEntry = document.getElementById('right-center-entry');
    if (teamGrid) teamGrid.style.display = hasManagedProject ? 'grid' : 'none';
    if (rightEntry) rightEntry.style.display = hasManagedProject ? 'flex' : 'none';
}

function renderSimpleHomeFlow(projectsCount) {
    const panel = document.getElementById('simple-flow-panel');
    if (!panel) return;
    panel.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:8px;">
            <strong style="font-size:16px; color:#111827;">主页简易流程</strong>
            <span style="font-size:12px; color:#64748b;">重协作项目 ${projectsCount}</span>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
            <span style="font-size:12px; background:#ecfeff; color:#155e75; padding:4px 8px; border-radius:999px;">发布需求</span>
            <span style="font-size:12px; background:#eff6ff; color:#1d4ed8; padding:4px 8px; border-radius:999px;">人员组成</span>
            <span style="font-size:12px; background:#f0fdf4; color:#166534; padding:4px 8px; border-radius:999px;">日常打卡防放鸽子</span>
        </div>
        <div style="font-size:13px; color:#475569; line-height:1.6;">只有你参与了开启项目管理的项目，才会展示下方项目管理界面。</div>
    `;
}

async function loadProjectDetail(projectId) {
    const currentUser = localStorage.getItem('currentUser');
    const panel = document.getElementById('project-detail-panel');
    if (!panel) return;

    panel.innerHTML = '<p style="color:#9ca3af;">正在加载项目详情...</p>';

    try {
        const response = await fetch(`http://localhost:3000/api/projects/${projectId}/detail?user=${encodeURIComponent(currentUser)}`);
        const data = await response.json();
        if (!data.success) {
            panel.innerHTML = `<p style="color:#ef4444;">${data.message || '加载失败'}</p>`;
            return;
        }

        const detail = data.data;
        const project = detail.project;
        const members = detail.members || [];
        const checkins = (detail.checkins || []).slice(0, 16);

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap;">
                <h3 style="margin:0; font-size:18px; color:#111827;">${project.title}</h3>
                <span style="font-size:12px; color:#374151; background:#e5e7eb; border-radius:999px; padding:6px 10px;">${statusLabel(project.status)}</span>
            </div>

            <div style="margin:10px 0 14px 0;">
                <strong style="display:block; margin-bottom:6px;">人员组成</strong>
                <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    ${members.length ? members.map((m) => {
                        const roleText = m.role === 'leader' ? '负责人' : (m.role === 'core_member' ? '核心成员' : '普通成员');
                        const bg = m.role === 'leader' ? '#dbeafe' : (m.role === 'core_member' ? '#ecfeff' : '#f1f5f9');
                        return `<span style="font-size:12px; background:${bg}; color:#334155; padding:4px 8px; border-radius:999px;">${m.user_name}（${roleText}）</span>`;
                    }).join('') : '<span style="font-size:12px; color:#9ca3af;">暂无成员信息</span>'}
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
                    ${checkins.length ? checkins.map((c) => `<div style="display:flex; justify-content:space-between; gap:10px; align-items:flex-start; font-size:12px; color:#374151; padding:6px 0; border-bottom:1px dashed #e5e7eb;"><div><strong>${c.user_name}</strong> (${c.task_completion}%)：${c.progress_note || '无'} <span style="color:#9ca3af;">${c.created_at}</span></div></div>`).join('') : '<span style="font-size:12px; color:#9ca3af;">暂无打卡记录</span>'}
                </div>
            </div>
            <button onclick="openFullTeamCenter(${project.id})" style="width:auto; padding:8px 12px; font-size:12px; background:#0f172a; color:#fff;">进入项目管理</button>
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
        updateManagementEntryVisibility(myProjects.length > 0);
        renderSimpleHomeFlow(myProjects.length);
        renderProjectList();

        if (myProjects.length > 0) {
            const target = myProjects.find((p) => p.id === activeProjectId) || myProjects[0];
            activeProjectId = target.id;
            await loadProjectDetail(activeProjectId);
        } else {
            document.getElementById('project-detail-panel').innerHTML = '<p style="color:#9ca3af; font-size:14px;">你还没有参与开启项目管理的项目。</p>';
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
    alert('当前没有开启项目管理的重协作项目，先发布并开启项目管理后再进入。');
}

async function loadRecommendations() {
    const currentUser = localStorage.getItem('currentUser');
    const container = document.getElementById('recommendation-container');
    if (!currentUser || !container) return;

    container.innerHTML = '<p style="text-align:center; color:#9ca3af; padding:16px;">正在计算推荐...</p>';

    try {
        let resp = await fetch(`http://localhost:3000/api/recommendations-ai?user=${encodeURIComponent(currentUser)}&limit=6`);
        let data = await resp.json();

        if (!data.success) {
            resp = await fetch(`http://localhost:3000/api/recommendations?user=${encodeURIComponent(currentUser)}&limit=6`);
            data = await resp.json();
        }
        if (!data.success) {
            container.innerHTML = `<p style="color:#ef4444; text-align:center;">${data.message || '推荐加载失败'}</p>`;
            return;
        }

        const items = data.data || [];
        if (!items.length) {
            container.innerHTML = '<p style="color:#6b7280; text-align:center; padding:12px;">当前没有符合条件的推荐，先完善个人画像或发布更多帖子试试。</p>';
            return;
        }

        container.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px;">
                ${items.map((item) => {
                    const reasons = (item.recommendation_reasons || []).map((r) => `<div style="font-size:12px; color:#334155;">• ${r}</div>`).join('');
                    const postCampus = item.campus || '';
                    const modeText = Number(item.accept_cross_campus || 0) === 1
                        ? (postCampus ? `可跨校区 · 发布校区 ${postCampus}` : '可跨校区')
                        : (postCampus ? `同校区优先 · ${postCampus}` : '');

                    return `
                        <div class="post-card recommendation-card" style="padding: 18px;">
                            <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start; margin-bottom:8px;">
                                <strong style="color:#1f2937; line-height:1.45; font-size:16px;">${item.title}</strong>
                            </div>
                            <div style="font-size:14px; color:#6b7280; margin-bottom:10px;">${modeText ? `${modeText} · ` : ''}${item.type || ''}</div>
                            <div style="max-height:86px; overflow:hidden; margin-bottom:10px; font-size:15px; color:#374151; line-height:1.55;">${item.content || ''}</div>
                            <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:12px;">${reasons}</div>
                            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                                <a href="profile.html?user=${item.author}" style="font-size:13px; color:#2563eb; text-decoration:none;">发布者：${item.author}</a>
                                <button onclick="applyForPost(${item.id})" style="width:auto; padding:7px 12px; font-size:13px; background:#2563eb; color:#fff; border:none; border-radius:7px;">我感兴趣</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<p style="color:#ef4444; text-align:center;">网络错误，推荐加载失败</p>';
    }
}

