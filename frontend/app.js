const AUTH_LANGUAGE_STORAGE_KEY = 'campusmatch-language';

const AUTH_COPY = {
    zh: {
        title: 'CampusMatch | 登录',
        visualAria: 'CampusMatch 连结 · 成长 · 无限可能',
        brandSubtitle: '连结 · 成长 · 无限可能',
        chip: '快捷协作',
        heroTitle: '为多人任务或活动找到合适搭档。',
        heroBody: '和同学交流、发布需求、加入项目，让合作在一个专注的空间里持续推进。',
        moreLink: '了解更多',
        tabs: ['登录', '注册', '重置'],
        tabAria: '身份验证',
        login: {
            heading: '欢迎回来！',
            subtitle: '请先登录',
            emailLabel: '邮箱',
            emailPlaceholder: '邮箱地址',
            passwordLabel: '密码',
            passwordPlaceholder: '请输入密码',
            submit: '登录',
            switchText: '还没有账号？ <span onclick="switchForm(\'register\')">创建账号</span> · <span onclick="switchForm(\'reset\')">忘记密码</span>'
        },
        register: {
            heading: '创建账号',
            subtitle: '从建立你的身份开始',
            nameLabel: '姓名',
            namePlaceholder: '姓名或昵称',
            emailLabel: '邮箱',
            emailPlaceholder: '邮箱地址',
            codeLabel: '验证码',
            codePlaceholder: '验证码',
            codeButton: '获取验证码',
            passwordLabel: '密码',
            passwordPlaceholder: '设置密码',
            submit: '创建账号',
            switchText: '已经有账号了？ <span onclick="switchForm(\'login\')">登录</span>'
        },
        reset: {
            heading: '重置密码',
            subtitle: '验证邮箱并设置新密码',
            emailLabel: '邮箱',
            emailPlaceholder: '邮箱地址',
            codeLabel: '验证码',
            codePlaceholder: '验证码',
            codeButton: '获取验证码',
            passwordLabel: '新密码',
            passwordPlaceholder: '新密码',
            submit: '重置密码',
            switchText: '想起来了？ <span onclick="switchForm(\'login\')">返回登录</span>'
        },
        languageToggleText: 'EN',
        languageToggleLabel: '切换到英文',
        alerts: {
            emailRequired: '请先输入邮箱！',
            networkError: '网络错误，无法连接到服务器！',
            loginInputRequired: '请输入邮箱和密码！',
            loginFailedPrefix: '登录失败：',
            registerInputRequired: '请将信息和验证码填写完整！',
            registerSuccess: '账号创建成功！',
            registerFailedPrefix: '注册失败：',
            resetInputRequired: '请将信息和新密码填写完整！',
            resetSuccess: '密码已重置，请重新登录。',
            resetFailedPrefix: '重置失败：',
            codeSent: '验证码已发送，请查收。',
            codeSendFailedPrefix: '验证码发送失败：'
        }
    },
    en: {
        title: 'CampusMatch | Log in',
        visualAria: 'CampusMatch academic workspace',
        brandSubtitle: 'Academic Workspace',
        chip: 'Structured collaboration',
        heroTitle: 'Find the right teammates for serious campus work.',
        heroBody: 'Connect with classmates, post needs, and join projects so academic collaboration keeps moving in one focused space.',
        moreLink: 'Learn more',
        tabs: ['Log in', 'Sign up', 'Reset'],
        tabAria: 'Authentication',
        login: {
            heading: 'Welcome back',
            subtitle: 'Log in to continue your collaboration.',
            emailLabel: 'School email',
            emailPlaceholder: 'Email address',
            passwordLabel: 'Password',
            passwordPlaceholder: 'Enter your password',
            submit: 'Log in',
            switchText: 'No account yet? <span onclick="switchForm(\'register\')">Create one</span> · <span onclick="switchForm(\'reset\')">Forgot password</span>'
        },
        register: {
            heading: 'Create account',
            subtitle: 'Start from your campus identity.',
            nameLabel: 'Name',
            namePlaceholder: 'Name or nickname',
            emailLabel: 'School email',
            emailPlaceholder: 'Email address',
            codeLabel: 'Verification code',
            codePlaceholder: 'Verification code',
            codeButton: 'Get code',
            passwordLabel: 'Password',
            passwordPlaceholder: 'Create a password',
            submit: 'Create account',
            switchText: 'Already have an account? <span onclick="switchForm(\'login\')">Log in</span>'
        },
        reset: {
            heading: 'Reset password',
            subtitle: 'Verify your email and set a new password.',
            emailLabel: 'School email',
            emailPlaceholder: 'Email address',
            codeLabel: 'Verification code',
            codePlaceholder: 'Verification code',
            codeButton: 'Get code',
            passwordLabel: 'New password',
            passwordPlaceholder: 'New password',
            submit: 'Reset password',
            switchText: 'Remembered it? <span onclick="switchForm(\'login\')">Back to login</span>'
        },
        languageToggleText: '中文',
        languageToggleLabel: 'Switch to Chinese',
        alerts: {
            emailRequired: 'Please enter your email first!',
            networkError: 'Network error. Unable to connect to the server!',
            loginInputRequired: 'Please enter your email and password!',
            loginFailedPrefix: 'Login failed: ',
            registerInputRequired: 'Please complete the information and verification code!',
            registerSuccess: 'Account created successfully!',
            registerFailedPrefix: 'Registration failed: ',
            resetInputRequired: 'Please complete the information and new password!',
            resetSuccess: 'Password reset. Please log in again.',
            resetFailedPrefix: 'Reset failed: ',
            codeSent: 'Verification code sent. Please check your inbox.',
            codeSendFailedPrefix: 'Unable to send verification code: '
        }
    }
};

let currentAuthLanguage = getStoredAuthLanguage();
let currentAuthForm = 'login';

function getStoredAuthLanguage() {
    const storedLanguage = localStorage.getItem(AUTH_LANGUAGE_STORAGE_KEY);
    if (storedLanguage === 'en' || storedLanguage === 'zh') return storedLanguage;
    const browserLanguage = (navigator.language || navigator.userLanguage || '').toLowerCase();
    return browserLanguage.startsWith('en') ? 'en' : 'zh';
}

function getAuthCopy() {
    return AUTH_COPY[currentAuthLanguage] || AUTH_COPY.zh;
}

function setText(selector, value) {
    const el = document.querySelector(selector);
    if (el) el.textContent = value;
}

function setPlaceholder(inputId, value) {
    const el = document.getElementById(inputId);
    if (el) el.placeholder = value;
}

function setLabelText(inputId, value) {
    const el = document.querySelector(`label[for="${inputId}"]`);
    if (el) el.textContent = value;
}

function updateFormCopy(boxId, copy) {
    const box = document.getElementById(boxId);
    if (!box) return;

    const heading = box.querySelector('h2');
    const subtitle = box.querySelector('.subtitle');
    const submitButton = box.querySelector('.field-stack > button[type="button"]');
    const switchText = box.querySelector('.switch-text');

    if (heading) heading.textContent = copy.heading;
    if (subtitle) subtitle.textContent = copy.subtitle;

    if (boxId === 'login-box') {
        setLabelText('login-email', copy.emailLabel);
        setPlaceholder('login-email', copy.emailPlaceholder);
        setLabelText('login-password', copy.passwordLabel);
        setPlaceholder('login-password', copy.passwordPlaceholder);
        if (submitButton) {
            submitButton.innerHTML = `${copy.submit} <span class="material-symbols-outlined">arrow_forward</span>`;
        }
    } else if (boxId === 'register-box') {
        setLabelText('reg-name', copy.nameLabel);
        setPlaceholder('reg-name', copy.namePlaceholder);
        setLabelText('reg-email', copy.emailLabel);
        setPlaceholder('reg-email', copy.emailPlaceholder);
        setLabelText('reg-code', copy.codeLabel);
        setPlaceholder('reg-code', copy.codePlaceholder);
        setLabelText('reg-password', copy.passwordLabel);
        setPlaceholder('reg-password', copy.passwordPlaceholder);
        const codeButton = box.querySelector('.field-with-button .cm-button.ghost');
        if (codeButton) codeButton.textContent = copy.codeButton;
        if (submitButton) submitButton.textContent = copy.submit;
    } else if (boxId === 'reset-box') {
        setLabelText('reset-email', copy.emailLabel);
        setPlaceholder('reset-email', copy.emailPlaceholder);
        setLabelText('reset-code', copy.codeLabel);
        setPlaceholder('reset-code', copy.codePlaceholder);
        setLabelText('reset-password', copy.passwordLabel);
        setPlaceholder('reset-password', copy.passwordPlaceholder);
        const codeButton = box.querySelector('.field-with-button .cm-button.ghost');
        if (codeButton) codeButton.textContent = copy.codeButton;
        if (submitButton) submitButton.textContent = copy.submit;
    }

    if (switchText) switchText.innerHTML = copy.switchText;
}

function updateAuthTabs() {
    const tabs = document.querySelectorAll('.auth-tab');
    const copy = getAuthCopy();
    tabs.forEach((tab, index) => {
        if (copy.tabs[index]) tab.textContent = copy.tabs[index];
        tab.classList.toggle('active', (index === 0 && currentAuthForm === 'login') || (index === 1 && currentAuthForm === 'register') || (index === 2 && currentAuthForm === 'reset'));
    });
}

function updateAuthLanguageToggle() {
    const toggleButton = document.getElementById('language-toggle');
    if (!toggleButton) return;
    const copy = getAuthCopy();
    toggleButton.textContent = copy.languageToggleText;
    toggleButton.title = copy.languageToggleLabel;
    toggleButton.setAttribute('aria-label', copy.languageToggleLabel);
}

function applyAuthLanguage(language) {
    currentAuthLanguage = language === 'en' ? 'en' : 'zh';
    localStorage.setItem(AUTH_LANGUAGE_STORAGE_KEY, currentAuthLanguage);

    const copy = getAuthCopy();
    document.documentElement.lang = currentAuthLanguage === 'en' ? 'en' : 'zh-CN';
    document.title = copy.title;

    const visual = document.querySelector('.auth-visual');
    if (visual) visual.setAttribute('aria-label', copy.visualAria);

    setText('.cm-brand-subtitle', copy.brandSubtitle);
    setText('.auth-copy .cm-chip.success', copy.chip);
    setText('.auth-copy h1', copy.heroTitle);
    setText('.auth-copy p', copy.heroBody);

    const githubLink = document.querySelector('.auth-github-link');
    if (githubLink) {
        githubLink.innerHTML = `${copy.moreLink} <span class="material-symbols-outlined" style="font-size:14px;vertical-align:middle;">arrow_forward</span>`;
    }

    const authTabs = document.querySelector('.auth-tabs');
    if (authTabs) authTabs.setAttribute('aria-label', copy.tabAria);

    updateFormCopy('login-box', copy.login);
    updateFormCopy('register-box', copy.register);
    updateFormCopy('reset-box', copy.reset);
    updateAuthTabs();
    updateAuthLanguageToggle();
}

function toggleAuthLanguage() {
    applyAuthLanguage(currentAuthLanguage === 'zh' ? 'en' : 'zh');
}

function switchForm(targetForm) {
    currentAuthForm = targetForm === 'register' || targetForm === 'reset' ? targetForm : 'login';

    const loginBox = document.getElementById('login-box');
    const registerBox = document.getElementById('register-box');
    const resetBox = document.getElementById('reset-box');

    if (loginBox) loginBox.classList.add('hidden');
    if (registerBox) registerBox.classList.add('hidden');
    if (resetBox) resetBox.classList.add('hidden');

    if (currentAuthForm === 'register' && registerBox) {
        registerBox.classList.remove('hidden');
    } else if (currentAuthForm === 'reset' && resetBox) {
        resetBox.classList.remove('hidden');
    } else if (loginBox) {
        loginBox.classList.remove('hidden');
    }

    updateAuthTabs();
}

async function sendCode(emailInputId) {
    const copy = getAuthCopy();
    const email = document.getElementById(emailInputId).value;
    if (!email) {
        alert(copy.alerts.emailRequired);
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        if (data.success) {
            alert(copy.alerts.codeSent);
        } else {
            alert(`${copy.alerts.codeSendFailedPrefix}${data.message || ''}`.trim());
        }
    } catch (error) {
        alert(copy.alerts.networkError);
    }
}

async function login() {
    const copy = getAuthCopy();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (email === '' || password === '') {
        alert(copy.alerts.loginInputRequired);
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email, password: password })
        });

        const data = await response.json();

        if (data.success) {
            localStorage.setItem('currentUser', data.userName);
            window.location.href = 'dashboard.html';
        } else {
            alert(`${copy.alerts.loginFailedPrefix}${data.message || ''}`.trim());
        }
    } catch (error) {
        alert(copy.alerts.networkError);
    }
}

async function register() {
    const copy = getAuthCopy();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const code = document.getElementById('reg-code').value;
    const password = document.getElementById('reg-password').value;

    if (name === '' || email === '' || code === '' || password === '') {
        alert(copy.alerts.registerInputRequired);
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password, code })
        });

        const data = await response.json();

        if (data.success) {
            alert(copy.alerts.registerSuccess);
            document.getElementById('reg-password').value = '';
            switchForm('login');
        } else {
            alert(`${copy.alerts.registerFailedPrefix}${data.message || ''}`.trim());
        }
    } catch (error) {
        alert(copy.alerts.networkError);
    }
}

async function resetPassword() {
    const copy = getAuthCopy();
    const email = document.getElementById('reset-email').value;
    const code = document.getElementById('reset-code').value;
    const password = document.getElementById('reset-password').value;

    if (email === '' || code === '' || password === '') {
        alert(copy.alerts.resetInputRequired);
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password, code })
        });

        const data = await response.json();

        if (data.success) {
            alert(copy.alerts.resetSuccess);
            switchForm('login');
        } else {
            alert(`${copy.alerts.resetFailedPrefix}${data.message || ''}`.trim());
        }
    } catch (error) {
        alert(copy.alerts.networkError);
    }
}

function initializeAuthPage() {
    applyAuthLanguage(currentAuthLanguage);
    switchForm(currentAuthForm);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAuthPage);
} else {
    initializeAuthPage();
}
