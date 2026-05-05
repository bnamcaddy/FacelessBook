const API_URL = 'http://localhost:5000/api';

// State
let currentUser = JSON.parse(localStorage.getItem('user')) || null;

// DOM Elements
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const postsContainer = document.getElementById('posts-container');
const navUsername = document.getElementById('nav-username');

// Init
function init() {
    if (currentUser) {
        showMain();
    } else {
        showAuth();
    }
}

// UI Toggles
function showAuth() {
    authSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
}

function showMain() {
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    navUsername.innerText = currentUser.username;
    fetchPosts();
}

document.getElementById('show-register-btn').onclick = () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
};

document.getElementById('show-login-btn').onclick = () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
};

// --- Auth Actions ---

document.getElementById('register-btn').onclick = async () => {
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        alert('Registration successful! Please log in.');
        document.getElementById('show-login-btn').click();
    } catch (err) {
        alert(err.message);
    }
};

document.getElementById('login-btn').onclick = async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(currentUser));
        localStorage.setItem('token', data.token);
        showMain();
    } catch (err) {
        alert(err.message);
    }
};

document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    currentUser = null;
    showAuth();
};

// --- Post Actions ---

async function fetchPosts() {
    try {
        const res = await fetch(`${API_URL}/posts`);
        const posts = await res.json();
        renderPosts(posts);
    } catch (err) {
        console.error('Error fetching posts:', err);
    }
}

function renderPosts(posts) {
    postsContainer.innerHTML = '';
    posts.forEach(post => {
        const postEl = document.createElement('div');
        postEl.className = 'post glass-card';
        postEl.innerHTML = `
            <div class="post-header">
                <div class="post-user">${post.username}</div>
                <div class="post-date">${new Date(post.created_at).toLocaleDateString()}</div>
            </div>
            <div class="post-content">${post.content}</div>
            <div class="post-actions">
                <button class="action-btn like-btn" onclick="likePost(${post.id})">👍 Like</button>
                <button class="action-btn comment-btn" onclick="addComment(${post.id})">💬 Comment</button>
            </div>
        `;
        postsContainer.appendChild(postEl);
    });
}

document.getElementById('create-post-btn').onclick = async () => {
    const content = document.getElementById('post-content').value;
    if (!content) return;

    try {
        const res = await fetch(`${API_URL}/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, content })
        });
        if (res.ok) {
            document.getElementById('post-content').value = '';
            fetchPosts();
        }
    } catch (err) {
        console.error('Error creating post:', err);
    }
};

async function likePost(postId) {
    try {
        await fetch(`${API_URL}/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        alert('Liked!');
    } catch (err) {
        console.error('Error liking post:', err);
    }
}

async function addComment(postId) {
    const content = prompt("Enter your comment:");
    if (!content) return;

    try {
        await fetch(`${API_URL}/posts/${postId}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, content })
        });
        alert('Comment added!');
    } catch (err) {
        console.error('Error adding comment:', err);
    }
}

init();
