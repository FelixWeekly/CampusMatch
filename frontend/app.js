// 这个函数用来在“登录”和“注册”界面之间切换
function switchForm(targetForm) {
    // 通过 ID 抓取到 HTML 里的两个大盒子 (类似 C++ 里的获取指针)
    const loginBox = document.getElementById('login-box');
    const registerBox = document.getElementById('register-box');

    if (targetForm === 'register') {
        // 隐藏登录框，显示注册框
        loginBox.classList.add('hidden');
        registerBox.classList.remove('hidden');
    } else if (targetForm === 'login') {
        // 隐藏注册框，显示登录框
        registerBox.classList.add('hidden');
        loginBox.classList.remove('hidden');
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
    const password = document.getElementById('reg-password').value;

    if (name === '' || email === '' || password === '') {
        alert('请将信息填写完整！');
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
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