const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// DB Connection
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

pool.connect((err) => {
    if (err) {
        console.error('Database connection error', err.stack);
    } else {
        console.log('Connected to PostgreSQL');
    }
});

// --- Auth Routes ---

// Register
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, hashedPassword]
        );
        res.status(201).json(newUser.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed. Username or Email might be taken.' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });

        const isValid = await bcrypt.compare(password, user.rows[0].password);
        if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user.rows[0].id, username: user.rows[0].username, email: user.rows[0].email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// --- Post Routes ---

// Create Post
app.post('/api/posts', async (req, res) => {
    const { userId, content, imageUrl } = req.body;
    try {
        const newPost = await pool.query(
            'INSERT INTO posts (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING *',
            [userId, content, imageUrl]
        );
        res.status(201).json(newPost.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create post' });
    }
});

// Get All Posts
app.get('/api/posts', async (req, res) => {
    try {
        const posts = await pool.query(`
            SELECT posts.*, users.username 
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

app.post('/api/posts/:id/like', async (req, res) => {
    const { userId } = req.body;
    const postId = req.params.id;
    try {
        await pool.query('INSERT INTO likes (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [userId, postId]);
        res.status(200).json({ message: 'Liked' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to like post' });
    }
});

// --- Comment Routes ---

// --- Friend Routes ---

// Send Friend Request
app.post('/api/friends/request', async (req, res) => {
    const { userId, friendId } = req.body;
    const [id1, id2] = userId < friendId ? [userId, friendId] : [friendId, userId];
    try {
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

// Accept Friend Request
app.post('/api/friends/accept', async (req, res) => {
    const { userId, friendId } = req.body;
    const [id1, id2] = userId < friendId ? [userId, friendId] : [friendId, userId];
    try {
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

// Get Friends List
app.get('/api/friends/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const friends = await pool.query(`
            SELECT users.id, users.username 
            FROM friends 
            JOIN users ON (friends.user_id1 = users.id OR friends.user_id2 = users.id)
            WHERE (friends.user_id1 = $1 OR friends.user_id2 = $1) 
            AND users.id != $1 
            AND friends.status = 'accepted'
        `, [userId]);
        res.json(friends.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch friends' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
