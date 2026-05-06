// The base URL for the backend API
const API_URL = 'http://localhost:5000/api';

// --- Application State ---
// Retrieve the logged-in user from local storage, or null if not logged in
let currentUser = JSON.parse(localStorage.getItem('user')) || null;

// --- DOM Element Selection ---
// Selecting various sections and forms from the HTML to manipulate them with JS
const authSection = document.getElementById('auth-section');
const mainSection = document.getElementById('main-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const postsContainer = document.getElementById('posts-container');
const navUsername = document.getElementById('nav-username');

// --- Initialization ---
// Checks if a user is already logged in when the page loads
function init() {
    if (currentUser) {
        showMain(); // Show the feed if logged in
    } else {
        showAuth(); // Show the login screen if not logged in
    }
}

// --- UI Toggle Functions ---

// Display the login/registration section and hide the main feed
function showAuth() {
    authSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
}

// Display the main feed section and hide the auth section
function showMain() {
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    // Set the username in the navbar to the current user's name
    navUsername.innerText = currentUser.username;
    // Fetch and display posts from the server
    fetchPosts();
}

// Switch to the registration form
document.getElementById('show-register-btn').onclick = () => {
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
};

// Switch to the login form
document.getElementById('show-login-btn').onclick = () => {
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
};

// --- Authentication Actions ---

// Handle the user registration process
document.getElementById('register-btn').onclick = async () => {
    const username = document.getElementById('reg-username').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;

    try {
        // Send a POST request to the register API endpoint
        const res = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        const data = await res.json();
        // If the server returns an error, throw it to be caught by the catch block
        if (data.error) throw new Error(data.error);
        
        alert('Registration successful! Please log in.');
        // Automatically switch to the login view after successful registration
        document.getElementById('show-login-btn').click();
    } catch (err) {
        alert(err.message); // Show error message to the user
    }
};

// Handle the user login process
document.getElementById('login-btn').onclick = async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        // Send a POST request to the login API endpoint
        const res = await fetch(`${API_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Store user data and authentication token in local storage for session persistence
        currentUser = data.user;
        localStorage.setItem('user', JSON.stringify(currentUser));
        localStorage.setItem('token', data.token);
        // Navigate to the main application view
        showMain();
    } catch (err) {
        alert(err.message);
    }
};

// Handle the logout process
document.getElementById('logout-btn').onclick = () => {
    // Clear user session data from local storage
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    currentUser = null;
    // Redirect to the login screen
    showAuth();
};

// --- Post Actions ---

// Fetch all posts from the backend database
async function fetchPosts() {
    try {
        const res = await fetch(`${API_URL}/posts`);
        const posts = await res.json();
        // Pass the fetched posts to the render function to display them
        renderPosts(posts);
    } catch (err) {
        console.error('Error fetching posts:', err);
    }
}

// Dynamically generate and insert post HTML into the posts container
function renderPosts(posts) {
    postsContainer.innerHTML = ''; // Clear existing posts
    posts.forEach(post => {
        const postEl = document.createElement('div');
        postEl.className = 'post glass-card'; // Apply modern glassmorphism styling
        postEl.innerHTML = `
            <div class="post-header">
                <div class="post-user">${post.username}</div>
                <div class="post-date">${new Date(post.created_at).toLocaleDateString()}</div>
            </div>
            <div class="post-content">${post.content}</div>
            <div class="post-actions">
                <!-- Click handlers for liking and commenting -->
                <button class="action-btn like-btn" onclick="likePost(${post.id})">👍 Like</button>
                <button class="action-btn comment-btn" onclick="addComment(${post.id})">💬 Comment</button>
            </div>
        `;
        postsContainer.appendChild(postEl);
    });
}

// Handle creating a new post
document.getElementById('create-post-btn').onclick = async () => {
    const content = document.getElementById('post-content').value;
    if (!content) return; // Don't allow empty posts

    try {
        // Send the new post content to the server
        const res = await fetch(`${API_URL}/posts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id, content })
        });
        if (res.ok) {
            document.getElementById('post-content').value = ''; // Clear the input field
            fetchPosts(); // Refresh the feed to show the new post
        }
    } catch (err) {
        console.error('Error creating post:', err);
    }
};

// Handle liking a post
async function likePost(postId) {
    try {
        // Send a request to the like endpoint for the specific post
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

// Handle adding a comment to a post
async function addComment(postId) {
    const content = prompt("Enter your comment:");
    if (!content) return;

    try {
        // Send the comment content to the server (Note: Endpoint must exist in server.js)
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

// Kick off the application on page load
init();

