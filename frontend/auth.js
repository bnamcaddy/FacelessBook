const API_URL = 'http://localhost:5000/api';

// --- Utility Functions ---

// Toggle Password Visibility
function togglePassword(inputId, icon) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Cookie Helpers
function setCookie(name, value, days) {
    const date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = name + "=" + value + ";" + expires + ";path=/;SameSite=Strict";
}

function getCookie(name) {
    const cname = name + "=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) == ' ') c = c.substring(1);
        if (c.indexOf(cname) == 0) return c.substring(cname.length, c.length);
    }
    return "";
}

// Show Message in UI
function showMessage(containerId, text, type = 'error') {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerText = text;
    container.className = `msg-container ${type}`;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            container.style.display = 'none';
        }, 5000);
    }
}

// --- Redirect if already logged in ---
if (getCookie('token') && localStorage.getItem('user')) {
    window.location.href = 'index.html';
}

// --- Handle Registration ---
const regBtn = document.getElementById('register-btn');
if (regBtn) {
    regBtn.onclick = async () => {
        const username = document.getElementById('reg-username').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm-password').value;
        const msgContainer = 'reg-msg';

        // Frontend Validations
        if (!username || !email || !password) {
            showMessage(msgContainer, 'Please fill in all required fields.');
            return;
        }
        if (password.length < 6) {
            showMessage(msgContainer, 'Password must be at least 6 characters long.');
            return;
        }
        if (password !== confirmPassword) {
            showMessage(msgContainer, 'Passwords do not match.');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Registration failed');
            
            showMessage(msgContainer, data.message || 'Registration successful! Redirecting to login...', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } catch (err) {
            showMessage(msgContainer, err.message);
        }
    };
}

// --- Handle Login ---
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
    loginBtn.onclick = async () => {
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const msgContainer = 'login-msg';

        if (!email || !password) {
            showMessage(msgContainer, 'Please enter both email and password.');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');

            localStorage.setItem('user', JSON.stringify(data.user));
            setCookie('token', data.token, 7); // Store token in cookie for 7 days
            showMessage(msgContainer, 'Login successful! Entering FacelessBook...', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } catch (err) {
            showMessage(msgContainer, err.message);
        }
    };
}

// --- Google Auth ---
const GOOGLE_CLIENT_ID = '123456789-placeholder.apps.googleusercontent.com'; // Replace with real Client ID later

async function handleGoogleCallback(response) {
    const msgContainer = document.getElementById('login-msg') || document.getElementById('reg-msg');
    
    try {
        const res = await fetch(`${API_URL}/auth/google`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: response.credential })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Google login failed');

        localStorage.setItem('user', JSON.stringify(data.user));
        setCookie('token', data.token, 7);
        showMessage(msgContainer ? msgContainer.id : '', 'Google Login successful! Redirecting...', 'success');
        
        setTimeout(() => {
            window.location.href = 'index.html';
        }, 1000);
    } catch (err) {
        if (msgContainer) showMessage(msgContainer.id, err.message);
        else alert(err.message);
    }
}

window.onload = function() {
    if (window.google) {
        google.accounts.id.initialize({
            client_id: GOOGLE_CLIENT_ID,
            callback: handleGoogleCallback
        });
        
        const btnContainer = document.getElementById('google-btn-container');
        if (btnContainer) {
            google.accounts.id.renderButton(
                btnContainer,
                { theme: "outline", size: "large", type: "standard" }
            );
        }
    }
};

// --- Handle Password Reset ---
const resetBtn = document.getElementById('reset-btn');
if (resetBtn) {
    resetBtn.onclick = async () => {
        const email = document.getElementById('reset-email').value;
        const newPassword = document.getElementById('reset-new-password').value;
        const confirmPassword = document.getElementById('reset-confirm-password').value;
        const msgContainer = 'reset-msg';

        if (!email || !newPassword || !confirmPassword) {
            showMessage(msgContainer, 'Please fill in all fields.');
            return;
        }

        if (newPassword.length < 6) {
            showMessage(msgContainer, 'Password must be at least 6 characters long.');
            return;
        }

        if (newPassword !== confirmPassword) {
            showMessage(msgContainer, 'Passwords do not match.');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, newPassword })
            });
            
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Password reset failed');
                showMessage(msgContainer, data.message, 'success');
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 3000);
            } else {
                const text = await res.text();
                console.error('Non-JSON response:', text);
                throw new Error('Server returned an unexpected response. Please ensure the backend server is running and updated.');
            }
        } catch (err) {
            showMessage(msgContainer, err.message);
        }
    };
}
