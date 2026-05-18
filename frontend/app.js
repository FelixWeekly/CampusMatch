// 这个函数用来在“登录”、“注册”和“找回密码”界面之间切换
function switchForm(targetForm) {
    const loginBox = document.getElementById('login-box');
    const registerBox = document.getElementById('register-box');
    const resetBox = document.getElementById('reset-box');

    // 先把所有表单隐藏
    loginBox.classList.add('hidden');
    registerBox.classList.add('hidden');
    resetBox.classList.add('hidden');

    // 再根据目标打开对应表单
    if (targetForm === 'register') {
        registerBox.classList.remove('hidden');
    } else if (targetForm === 'reset') {
        resetBox.classList.remove('hidden');
    } else {
        loginBox.classList.remove('hidden');
    }
}

// 获取邮箱验证码
async function sendCode(emailInputId) {
    const email = document.getElementById(emailInputId).value;
    if (!email) {
        alert('请先输入邮箱！');
        return;
    }
    
    try {
        const response = await fetch('http://localhost:3000/api/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        const data = await response.json();
        alert(data.message);
    } catch (error) {
        alert('网络错误，无法连接到服务器！');
    }
}

// 真实的登录请求
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    if (email === '' || password === '') {
        alert('请输入邮箱和密码！');
        return;
    }

    try {
        // fetch 就是前端向后端发请求的函数。await 表示“等后端处理完再往下走”
        const response = await fetch('http://localhost:3000/api/login', {
            method: 'POST', // 使用 POST 方法提交数据
            headers: { 'Content-Type': 'application/json' }, // 告诉后端我们发的是 JSON
            body: JSON.stringify({ email: email, password: password }) // 打包数据
        });

        const data = await response.json(); // 解析后端返回的结果

        if (data.success) {
            // 🌟 魔法：把后端返回的用户名存到浏览器的本地记忆里
            localStorage.setItem('currentUser', data.userName); 
            
            // 🌟 页面跳转指令：带你去大厅！
            window.location.href = "dashboard.html";
        } else {
            alert('登录失败：' + data.message);
        }
    } catch (error) {
        alert('网络错误，无法连接到服务器！');
    }
}

// 真实的注册请求
async function register() {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const code = document.getElementById('reg-code').value;
    const password = document.getElementById('reg-password').value;

    if (name === '' || email === '' || code === '' || password === '') {
        alert('请将信息和验证码填写完整！');
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
            alert('太棒了！' + data.message);
            // 注册成功，清空表单并自动切换回登录页面！
            document.getElementById('reg-password').value = ''; 
            switchForm('login'); 
        } else {
            alert('注册失败：' + data.message);
        }
    } catch (error) {
        alert('网络错误，无法连接到服务器！');
    }
}

// 重置密码请求
async function resetPassword() {
    const email = document.getElementById('reset-email').value;
    const code = document.getElementById('reset-code').value;
    const password = document.getElementById('reset-password').value;

    if (email === '' || code === '' || password === '') {
        alert('请将信息和新密码填写完整！');
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
            alert(data.message);
            switchForm('login'); 
        } else {
            alert('重置失败：' + data.message);
        }
    } catch (error) {
        alert('网络错误，无法连接到服务器！');
    }
}