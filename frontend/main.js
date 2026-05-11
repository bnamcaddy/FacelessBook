const API_URL = 'http://localhost:5000/api';

// --- Application State ---
let currentUser = JSON.parse(localStorage.getItem('user')) || null;

// --- DOM Element Selection ---
const mainSection = document.getElementById('main-section');
const postsContainer = document.getElementById('posts-container');
const navUsername = document.getElementById('nav-username');
const toastContainer = document.getElementById('toast-container');

// --- Initialization ---
function init() {
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    showMain();
}

// --- Utility Functions ---

function showNotification(message, type = 'success') {
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
    toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// --- UI Toggle Functions ---
function showMain() {
    if (navUsername) navUsername.innerText = currentUser.username;
    fetchPosts();
}

// --- Logout ---
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.onclick = () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = 'login.html';
    };
}

// --- Post Actions ---

async function fetchPosts() {
    try {
        const res = await fetch(`${API_URL}/posts`);
        const posts = await res.json();
        renderPosts(posts);
    } catch (err) {
        showNotification('Failed to fetch posts.', 'error');
    }
}

async function renderPosts(posts) {
    if (!postsContainer) return;
    postsContainer.innerHTML = '';
    
    for (const post of posts) {
        const postEl = document.createElement('div');
        postEl.className = 'post glass-card';
        
        // Fetch comments for this post
        const commentsRes = await fetch(`${API_URL}/posts/${post.id}/comments`);
        const comments = await commentsRes.json();
        
        postEl.innerHTML = `
            <div class="post-header">
                <div class="post-user">${post.username}</div>
                <div class="post-date">${new Date(post.created_at).toLocaleDateString()}</div>
            </div>
            <div class="post-content">${post.content}</div>
            
            <div class="post-stats">
                <span><i class="fas fa-thumbs-up"></i> ${post.likes_count || 0}</span>
                <span><i class="fas fa-comment"></i> ${post.comments_count || 0}</span>
                <span><i class="fas fa-share"></i> ${post.shares_count || 0}</span>
            </div>
            
            <div class="post-actions">
                <button class="action-btn like-btn" onclick="toggleLike(${post.id})">
                    <i class="fas fa-thumbs-up"></i> Like
                </button>
                <button class="action-btn comment-btn" onclick="toggleComments(${post.id})">
                    <i class="fas fa-comment"></i> Comment
                </button>
                <button class="action-btn share-btn" onclick="sharePost(${post.id})">
                    <i class="fas fa-share"></i> Share
                </button>
            </div>
            
            <div class="comments-section" id="comments-${post.id}" style="display: none;">
                <div class="comments-list" id="list-${post.id}">
                    ${comments.map(c => `
                        <div class="comment">
                            <span class="comment-user">${c.username}:</span>
                            <span class="comment-text">${c.content}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="comment-input-area">
                    <input type="text" placeholder="Write a comment..." id="input-${post.id}">
                    <button onclick="addComment(${post.id})"><i class="fas fa-paper-plane"></i></button>
                </div>
            </div>
        `;
        postsContainer.appendChild(postEl);
    }
}

function toggleComments(postId) {
    const section = document.getElementById(`comments-${postId}`);
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
}

const createPostBtn = document.getElementById('create-post-btn');
if (createPostBtn) {
    createPostBtn.onclick = async () => {
        const content = document.getElementById('post-content').value;
        if (!content) {
            showNotification('Post content cannot be empty.', 'error');
            return;
        }

        try {
            const res = await fetch(`${API_URL}/posts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: currentUser.id, content })
            });
            const data = await res.json();
            if (res.ok) {
                document.getElementById('post-content').value = '';
                showNotification(data.message || 'Post created successfully!');
                fetchPosts();
            } else {
                throw new Error(data.error || 'Failed to create post');
            }
        } catch (err) {
            showNotification(err.message, 'error');
        }
    };
}

async function toggleLike(postId) {
    try {
        const res = await fetch(`${API_URL}/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message);
            fetchPosts(); // Refresh to update counts
        }
    } catch (err) {
        showNotification('Action failed', 'error');
    }
}

async function addComment(postId) {
    const input = document.getElementById(`input-${postId}`);
    const content = input.value;
    if (!content) return;

    try {
        const res = await fetch(`${API_URL}/posts/${postId}/comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, content })
        });
        const data = await res.json();
        if (res.ok) {
            input.value = '';
            // Append comment to list without full refresh for better UX
            const list = document.getElementById(`list-${postId}`);
            const commentEl = document.createElement('div');
            commentEl.className = 'comment';
            commentEl.innerHTML = `<span class="comment-user">${currentUser.username}:</span> <span class="comment-text">${content}</span>`;
            list.appendChild(commentEl);
            showNotification(data.message);
        }
    } catch (err) {
        showNotification('Comment failed', 'error');
    }
}

async function sharePost(postId) {
    try {
        const res = await fetch(`${API_URL}/posts/${postId}/share`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id })
        });
        const data = await res.json();
        if (res.ok) {
            showNotification(data.message);
            fetchPosts();
        }
    } catch (err) {
        showNotification('Share failed', 'error');
    }
}

init();
