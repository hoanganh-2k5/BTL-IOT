const login_btn = document.querySelector('.submit-btn');
const logout_btn = document.querySelector('.logout-btn');
let ok = true;

async function checkAuth() {
    try {
        await window.api.getCurrentUser();
    } catch (error) {
        console.log(error)
        window.location.href = "/";
    }
}

if (
    window.location.pathname !== "/" &&
    window.location.pathname !== "/index.html"
) {
    checkAuth();
}

if(login_btn){
    login_btn.onclick = async (event) => {
        event.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        if(username && password){
            try {
                await window.api.login(username, password);
                sessionStorage.setItem("loginsuccess", "true")
                window.location.href = "/dashboard.html";
            } catch (error) {
                alert(error.message);
            }
        }
        else{
            false_uname = document.getElementById("username");
            false_pass = document.getElementById("password");
            false_uname.classList.add("active-false")
            false_pass.classList.add("active-false")
            false_status = document.querySelector(".false-status");
            false_status.textContent = "Sai tên đăng nhập hoặc mật khẩu"
        }
    }
}
if(logout_btn){
    logout_btn.onclick = async () => {
        try {
            await window.api.logout();
            window.location.href = "/";
        } catch (error) {
            alert(error.message);
        }
    }
}

let connectionStatusLoading = false;

function renderGlobalConnectionStatus(online) {
    const badge = document.querySelector(".system-online");
    if (!badge) return;

    const text = badge.querySelector("span:last-child");
    badge.classList.toggle("offline", !online);

    if (text) {
        text.textContent = online ? "1/1 ESP8266 Online" : "0/1 ESP8266 Online";
    }
}

async function loadGlobalConnectionStatus() {
    if (connectionStatusLoading) return;
    connectionStatusLoading = true;

    try {
        const result = await window.api.getDashboard();
        const online =
            result.data?.node?.connectionStatus === "online";

        renderGlobalConnectionStatus(online);
    } catch (error) {
        renderGlobalConnectionStatus(false);
    } finally {
        connectionStatusLoading = false;
    }
}

const protectedPage =
    window.location.pathname !== "/" &&
    window.location.pathname !== "/index.html";

const dashboardPage =
    window.location.pathname === "/dashboard.html";

if (protectedPage && !dashboardPage) {
    loadGlobalConnectionStatus();
    setInterval(loadGlobalConnectionStatus, 2000);
}
