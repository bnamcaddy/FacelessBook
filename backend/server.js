// Import required modules
const express = require('express'); // Web framework for Node.js
const cors = require('cors'); // Middleware to enable Cross-Origin Resource Sharing
const { Pool } = require('pg'); // PostgreSQL client for Node.js
const bcrypt = require('bcryptjs'); // Library for hashing passwords
const jwt = require('jsonwebtoken'); // Library for creating and verifying JSON Web Tokens
require('dotenv').config(); // Load environment variables from a .env file

// Initialize the Express application
const app = express();
// Define the port the server will listen on, using environment variable or default to 5000
const PORT = process.env.PORT || 5000;

// Middleware configuration
app.use(cors()); // Allow cross-origin requests from the frontend
app.use(express.json()); // Parse incoming JSON requests

// Database Connection Configuration
// Uses credentials stored in environment variables for security
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Connect to the PostgreSQL database
pool.connect((err) => {
    if (err) {
        console.error('Database connection error', err.stack); // Log connection errors
    } else {
        console.log('Connected to PostgreSQL'); // Log successful connection
    }
});

// --- Authentication Routes ---

// Register a new user
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    
    // Check for minimum password length
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    try {
        // Hash the password before storing it in the database for security
        const hashedPassword = await bcrypt.hash(password, 10);
        // Insert the new user into the 'users' table
        const newUser = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, hashedPassword]
        );
        // Return the newly created user details and a success message
        res.status(201).json({ 
            message: 'Registration successful! You can now log in.', 
            user: newUser.rows[0] 
        });
    } catch (err) {
        console.error(err);
        // Return error if registration fails (e.g., duplicate username or email)
        res.status(500).json({ error: 'Registration failed. Username or Email might be taken.' });
    }
});

// Login an existing user
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        // Find the user in the database by their email
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(401).json({ error: 'Username or password is wrong' });

        // Compare the provided password with the hashed password in the database
        const isValid = await bcrypt.compare(password, user.rows[0].password);
        if (!isValid) return res.status(401).json({ error: 'Username or password is wrong' });

        // Generate a JWT token for the user session, valid for 1 hour
        const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        // Return the token and user information
        res.json({ token, user: { id: user.rows[0].id, username: user.rows[0].username, email: user.rows[0].email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- Post Routes ---

// Create a new post
app.post('/api/posts', async (req, res) => {
    const { userId, content, imageUrl } = req.body;
    try {
        // Insert a new post into the 'posts' table
        const newPost = await pool.query(
            'INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING *',
            [userId, content, imageUrl]
        );
        // Return the created post data and a success message
        res.status(201).json({ 
            message: 'Post created successfully!', 
            post: newPost.rows[0] 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// Retrieve all posts for the news feed with counts
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await pool.query(`
            SELECT 
                posts.*, 
                users.username,
                (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as likes_count,
                (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comments_count,
                (SELECT COUNT(*) FROM shares WHERE shares.post_id = posts.id) as shares_count
            FROM posts 
            JOIN users ON posts.user_id = users.id 
            ORDER BY posts.created_at DESC
        `);
        res.json(posts.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch posts' });
    }
});

// --- Like Routes ---

// Like or Unlike a post (Toggle)
app.post('/api/posts/:id/like', async (req, res) => {
    const { userId } = req.body;
    const postId = req.params.id;
    try {
        const checkLike = await pool.query('SELECT * FROM likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
        if (checkLike.rows.length > 0) {
            await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
            res.status(200).json({ message: 'Unliked' });
        } else {
            await pool.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
            res.status(200).json({ message: 'Liked' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

// --- Comment Routes ---

// Add a comment to a post
app.post('/api/posts/:id/comment', async (req, res) => {
    const { userId, content } = req.body;
    const postId = req.params.id;
    try {
        const newComment = await pool.query(
            'INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3) RETURNING *',
            [userId, postId, content]
        );
        // Return comment with username
        const commentData = await pool.query(`
            SELECT comments.*, users.username 
            FROM comments 
            JOIN users ON comments.user_id = users.id 
            WHERE comments.id = $1
        `, [newComment.rows[0].id]);
        res.status(201).json({ 
            message: 'Comment added successfully!', 
            comment: commentData.rows[0] 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

// Get all comments for a post
app.get('/api/posts/:id/comments', async (req, res) => {
    const postId = req.params.id;
    try {
        const comments = await pool.query(`
            SELECT comments.*, users.username 
            FROM comments 
            JOIN users ON comments.user_id = users.id 
            WHERE post_id = $1 
            ORDER BY created_at ASC
        `, [postId]);
        res.json(comments.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// --- Friend Routes ---

// Send a friend request to another user
app.post('/api/friends/request', async (req, res) => {
    const { userId, friendId } = req.body;
    // Ensure user_id1 is always smaller than user_id2 to maintain a consistent pair in the DB
    const [id1, id2] = userId < friendId ? [userId, friendId] : [friendId, userId];
    try {
        // Insert a pending friend relationship
        await pool.query(
            'INSERT INTO friends (user_id1, user_id2, status) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
            [id1, id2, 'pending']
        );
        res.status(200).json({ message: 'Friend request sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send friend request' });
    }
});

// Accept a friend request
app.post('/api/friends/accept', async (req, res) => {
    const { userId, friendId } = req.body;
    // Maintain consistent ordering of user IDs
    const [id1, id2] = userId < friendId ? [userId, friendId] : [friendId, userId];
    try {
        // Update the status of the friend relationship to 'accepted'
        await pool.query(
            'UPDATE friends SET status = $1 WHERE user_id1 = $2 AND user_id2 = $3',
            ['accepted', id1, id2]
        );
        res.status(200).json({ message: 'Friend request accepted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to accept friend request' });
    }
});

// Get the list of friends for a specific user
app.get('/api/friends/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        // Find all users who have an 'accepted' friendship with the current user
        const friends = await pool.query(`
            SELECT users.id, users.username 
            FROM friends 
            JOIN users ON (friends.user_id1 = users.id OR friends.user_id2 = users.id)
            WHERE (friends.user_id1 = $1 OR friends.user_id2 = $1) 
            AND users.id != $1 
            AND friends.status = 'accepted'
        `, [userId]);
        // Return the list of friends
        res.json(friends.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch friends' });
    }
});

// --- Share Routes ---

// Share a post
app.post('/api/posts/:id/share', async (req, res) => {
    const { userId } = req.body;
    const postId = req.params.id;
    try {
        await pool.query('INSERT INTO shares (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
        res.status(200).json({ message: 'Shared' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to share post' });
    }
});

// Start the server and listen for incoming requests
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

