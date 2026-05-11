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
if (localStorage.getItem('user')) {
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
            localStorage.setItem('token', data.token);
            showMessage(msgContainer, 'Login successful! Entering FacelessBook...', 'success');
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 1000);
        } catch (err) {
            showMessage(msgContainer, err.message);
        }
    };
}

// --- Placeholder for Google Auth ---
const googleLoginBtn = document.getElementById('google-login-btn');
const googleSignupBtn = document.getElementById('google-signup-btn');

const handleGoogleAuth = () => {
    alert('Google OAuth integration requires backend configuration with Client ID. Redirecting to auth flow...');
};

if (googleLoginBtn) googleLoginBtn.onclick = handleGoogleAuth;
if (googleSignupBtn) googleSignupBtn.onclick = handleGoogleAuth;
