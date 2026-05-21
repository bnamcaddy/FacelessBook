// Import required modules
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 5000;

// Set up HTTP and Socket.io server
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

// Map of userId -> socket.id
const userSockets = new Map();

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);
    
    // Register user
    socket.on('register', (userId) => {
        userSockets.set(Number(userId), socket.id);
        console.log(`User ${userId} registered with socket ${socket.id}`);
    });
    
    // Handle typing state
    socket.on('typing', ({ senderId, receiverId, isTyping }) => {
        const receiverSocketId = userSockets.get(Number(receiverId));
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('typing', { senderId, isTyping });
        }
    });

    // WebRTC Signaling
    socket.on('call-user', (data) => {
        const receiverSocketId = userSockets.get(Number(data.userToCall));
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('call-made', {
                offer: data.offer,
                socket: socket.id,
                callerId: data.callerId,
                isVideo: data.isVideo
            });
        }
    });

    socket.on('make-answer', (data) => {
        io.to(data.to).emit('answer-made', {
            socket: socket.id,
            answer: data.answer
        });
    });

    socket.on('ice-candidate', (data) => {
        io.to(data.to).emit('ice-candidate-received', data.candidate);
    });

    socket.on('end-call', (data) => {
        if (data.to) {
            io.to(data.to).emit('call-ended');
        }
    });

    socket.on('call-rejected', (data) => {
        if (data.to) {
            io.to(data.to).emit('call-rejected');
        }
    });

    // Read Receipt
    socket.on('read-receipt', ({ senderId, receiverId, messageId, time }) => {
        const receiverSocketId = userSockets.get(Number(receiverId));
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('read-receipt', { messageId, time, readerId: senderId });
        }
    });
    
    socket.on('disconnect', () => {
        for (let [userId, socketId] of userSockets.entries()) {
            if (socketId === socket.id) {
                userSockets.delete(userId);
                console.log(`User ${userId} disconnected`);
                break;
            }
        }
    });
});

// Google OAuth Client Setup
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '123456789-placeholder.apps.googleusercontent.com';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const path = require('path');
const multer = require('multer');

// Middleware configuration
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Multer Storage Configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'uploads'));
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|gif|mp4|mov|avi/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        if (mimetype && extname) return cb(null, true);
        cb(new Error('Only images and videos are allowed!'));
    }
});

// File Upload Endpoint
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    res.json({ url });
});

// Database Connection Configuration
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});

// Helper to create notification and emit real-time Socket event
async function createNotification(userId, senderId, type, message, referenceId = null) {
    try {
        const result = await pool.query(
            'INSERT INTO notifications (user_id, sender_id, type, message, reference_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [userId, senderId, type, message, referenceId]
        );
        
        // Fetch sender details to emit
        const sender = await pool.query('SELECT username, profile_pic FROM users WHERE id = $1', [senderId]);
        const senderUsername = sender.rows[0] ? sender.rows[0].username : 'Someone';
        const senderPic = sender.rows[0] ? sender.rows[0].profile_pic : null;

        const notifPayload = {
            ...result.rows[0],
            sender_username: senderUsername,
            sender_pic: senderPic
        };

        const receiverSocketId = userSockets.get(Number(userId));
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('notification', notifPayload);
        }
        return result.rows[0];
    } catch (err) {
        console.error('Error creating notification:', err);
    }
}

pool.connect(async (err, client, release) => {
    if (err) {
        console.error('Database connection error', err.stack);
    } else {
        console.log('Connected to PostgreSQL');
        // Run Migrations
        try {
            // Tables check & creation
            await client.query(`
                CREATE TABLE IF NOT EXISTS notifications (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    type VARCHAR(50) NOT NULL,
                    message TEXT NOT NULL,
                    reference_id INTEGER,
                    is_read BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS reels (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    video_url TEXT,
                    caption TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS marketplace (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    item_name VARCHAR(200) NOT NULL,
                    description TEXT,
                    price DECIMAL(10,2) NOT NULL,
                    image_url TEXT,
                    category VARCHAR(50) DEFAULT 'General',
                    status VARCHAR(20) DEFAULT 'available',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE IF NOT EXISTS stories (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    content TEXT,
                    image_url TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours')
                );
            `);

            // Columns check
            await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT \'\'');
            await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS privacy_settings JSONB DEFAULT \'{"message": "everyone", "story": "friends", "last_seen": "everyone"}\'');
            await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_settings JSONB DEFAULT \'{"messages": true, "stories": true, "sounds": true}\'');
            await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS appearance_settings JSONB DEFAULT \'{"theme": "light", "color": "blue", "font_size": "medium"}\'');
            await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE');
            await client.query('ALTER TABLE users ALTER COLUMN password DROP NOT NULL');
            
            await client.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS post_type VARCHAR(20) DEFAULT \'post\'');
            await client.query('UPDATE posts SET post_type = \'post\' WHERE post_type IS NULL');
            
            await client.query('ALTER TABLE posts ADD COLUMN IF NOT EXISTS privacy VARCHAR(30) DEFAULT \'public\'');
            await client.query('UPDATE posts SET privacy = \'public\' WHERE privacy IS NULL');
            
            await client.query(`
                CREATE TABLE IF NOT EXISTS close_friends (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    friend_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, friend_id)
                );
            `);
            
            await client.query('ALTER TABLE friends ADD COLUMN IF NOT EXISTS action_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE');
            await client.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE');

            // New Advanced Messaging Migrations
            await client.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) DEFAULT \'text\'');
            await client.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS media_url TEXT');
            await client.query('ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMP');
            await client.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_bot BOOLEAN DEFAULT FALSE');
            
            await client.query(`
                CREATE TABLE IF NOT EXISTS bot_responses (
                    id SERIAL PRIMARY KEY,
                    bot_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    keyword VARCHAR(100) NOT NULL,
                    response_text TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);

            // Reactions migrations
            await client.query('ALTER TABLE likes ADD COLUMN IF NOT EXISTS reaction_type VARCHAR(20) DEFAULT \'like\'');
            await client.query('UPDATE likes SET reaction_type = \'like\' WHERE reaction_type IS NULL');
            await client.query(`
                CREATE TABLE IF NOT EXISTS comment_reactions (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
                    reaction_type VARCHAR(20) DEFAULT 'like',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, comment_id)
                );
            `);
            
            console.log('Database migrations completed');
        } catch (migrationErr) {
            console.error('Migration error:', migrationErr);
        } finally {
            release();
        }
    }
});

// ============================================================
// --- Authentication Routes ---
// ============================================================

// Register a new user
app.post('/api/register', async (req, res) => {
    const { username, email, password } = req.body;
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = await pool.query(
            'INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email',
            [username, email, hashedPassword]
        );
        res.status(201).json({
            message: 'Registration successful! You can now log in.',
            user: newUser.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Registration failed. Username or Email might be taken.' });
    }
});

// Login an existing user
app.post('/api/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0) return res.status(401).json({ error: 'Username or password is wrong' });

        const isValid = await bcrypt.compare(password, user.rows[0].password);
        if (!isValid) return res.status(401).json({ error: 'Username or password is wrong' });

        const token = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user.rows[0].id, username: user.rows[0].username, email: user.rows[0].email } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Google Authentication Route
app.post('/api/auth/google', async (req, res) => {
    const { token } = req.body;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID,
        });
        const payload = ticket.getPayload();
        const { sub: google_id, email, name, picture } = payload;

        // Check if user exists
        let user = await pool.query('SELECT * FROM users WHERE google_id = $1 OR email = $2', [google_id, email]);
        
        if (user.rows.length === 0) {
            // Create new user
            const usernameBase = name.toLowerCase().replace(/[^a-z0-9]/g, '');
            const username = `${usernameBase}${Math.floor(Math.random() * 1000)}`;
            
            const newUser = await pool.query(
                'INSERT INTO users (username, email, google_id, profile_pic) VALUES ($1, $2, $3, $4) RETURNING id, username, email, profile_pic',
                [username, email, google_id, picture]
            );
            user = { rows: [newUser.rows[0]] };
        } else {
            // Update google_id if matched by email but google_id is null
            if (!user.rows[0].google_id) {
                await pool.query('UPDATE users SET google_id = $1 WHERE email = $2', [google_id, email]);
            }
        }

        const jwtToken = jwt.sign({ id: user.rows[0].id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ 
            token: jwtToken, 
            user: { 
                id: user.rows[0].id, 
                username: user.rows[0].username, 
                email: user.rows[0].email,
                profile_pic: user.rows[0].profile_pic
            } 
        });
    } catch (err) {
        console.error('Google Auth Error:', err);
        res.status(401).json({ error: 'Invalid Google Token' });
    }
});

// Reset user password
app.post('/api/reset-password', async (req, res) => {
    const { email, newPassword } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        const result = await pool.query(
            'UPDATE users SET password = $1 WHERE email = $2 RETURNING id',
            [hashedPassword, email]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: 'Password reset successful!' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Password reset failed' });
    }
});

// ============================================================
// --- Post Routes ---
// ============================================================

// Create a new post
app.post('/api/posts', async (req, res) => {
    const { userId, content, imageUrl, postType, privacy } = req.body;
    try {
        const newPost = await pool.query(
            'INSERT INTO posts (user_id, content, image_url, post_type, privacy) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [userId, content, imageUrl || null, postType || 'post', privacy || 'public']
        );
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
    const viewerId = req.query.viewerId ? Number(req.query.viewerId) : 0;
    try {
        const posts = await pool.query(`
            SELECT 
                posts.*, 
                users.username,
                users.profile_pic,
                (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as likes_count,
                (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comments_count,
                (SELECT COUNT(*) FROM shares WHERE shares.post_id = posts.id) as shares_count,
                (SELECT reaction_type FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $1) as viewer_reaction,
                (
                    SELECT json_object_agg(reaction_type, cnt) 
                    FROM (
                        SELECT reaction_type, COUNT(*) as cnt 
                        FROM likes 
                        WHERE likes.post_id = posts.id 
                        GROUP BY reaction_type
                    ) x
                ) as reactions_summary
            FROM posts 
            JOIN users ON posts.user_id = users.id 
            WHERE (posts.post_type = 'post' OR posts.post_type IS NULL)
              AND (
                  posts.privacy = 'public'
                  OR posts.user_id = $1
                  OR (posts.privacy = 'friends' AND EXISTS (
                      SELECT 1 FROM friends 
                      WHERE ((user_id1 = posts.user_id AND user_id2 = $1) OR (user_id1 = $1 AND user_id2 = posts.user_id))
                        AND status = 'accepted'
                  ))
                  OR (posts.privacy = 'close_friends' AND EXISTS (
                      SELECT 1 FROM close_friends
                      WHERE user_id = posts.user_id AND friend_id = $1
                  ))
              )
            ORDER BY posts.created_at DESC
        `, [viewerId]);
        res.json(posts.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch posts: ' + err.message });
    }
});

// ============================================================
// --- Like Routes ---
// ============================================================

app.post('/api/posts/:id/react', async (req, res) => {
    const { userId, reactionType } = req.body; // 'like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'
    const postId = req.params.id;
    const type = reactionType || 'like';
    try {
        const checkReact = await pool.query('SELECT * FROM likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
        if (checkReact.rows.length > 0) {
            if (checkReact.rows[0].reaction_type === type) {
                // Same reaction: remove it (toggle off)
                await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
                res.status(200).json({ message: 'Removed', reaction: null });
            } else {
                // Different reaction: update it
                await pool.query('UPDATE likes SET reaction_type = $1 WHERE user_id = $2 AND post_id = $3', [type, userId, postId]);
                res.status(200).json({ message: 'Updated', reaction: type });
            }
        } else {
            // New reaction
            await pool.query('INSERT INTO likes (user_id, post_id, reaction_type) VALUES ($1, $2, $3)', [userId, postId, type]);
            // Create notification for post owner
            const post = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
            if (post.rows.length > 0 && post.rows[0].user_id !== userId) {
                const sender = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
                await createNotification(post.rows[0].user_id, userId, 'like', `${sender.rows[0].username} reacted to your post`, postId);
            }
            res.status(200).json({ message: 'Reacted', reaction: type });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to react to post' });
    }
});

// Deprecated endpoint for simple backward compatibility (defaults to 'like' toggle)
app.post('/api/posts/:id/like', async (req, res) => {
    const { userId } = req.body;
    const postId = req.params.id;
    try {
        const checkLike = await pool.query('SELECT * FROM likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
        if (checkLike.rows.length > 0) {
            await pool.query('DELETE FROM likes WHERE user_id = $1 AND post_id = $2', [userId, postId]);
            res.status(200).json({ message: 'Unliked' });
        } else {
            await pool.query('INSERT INTO likes (user_id, post_id, reaction_type) VALUES ($1, $2, \'like\')', [userId, postId]);
            const post = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
            if (post.rows.length > 0 && post.rows[0].user_id !== userId) {
                const sender = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
                await createNotification(post.rows[0].user_id, userId, 'like', `${sender.rows[0].username} liked your post`, postId);
            }
            res.status(200).json({ message: 'Liked' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to toggle like' });
    }
});

// Check if user reacted to a post
app.get('/api/posts/:id/liked/:userId', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM likes WHERE user_id = $1 AND post_id = $2', [req.params.userId, req.params.id]);
        res.json({ liked: result.rows.length > 0, reaction: result.rows[0] ? result.rows[0].reaction_type : null });
    } catch (err) {
        res.status(500).json({ error: 'Failed to check reaction status' });
    }
});

// ============================================================
// --- Comment Routes ---
// ============================================================

app.post('/api/posts/:id/comment', async (req, res) => {
    const { userId, content } = req.body;
    const postId = req.params.id;
    try {
        const newComment = await pool.query(
            'INSERT INTO comments (user_id, post_id, content) VALUES ($1, $2, $3) RETURNING *',
            [userId, postId, content]
        );
        const commentData = await pool.query(`
            SELECT comments.*, users.username 
            FROM comments 
            JOIN users ON comments.user_id = users.id 
            WHERE comments.id = $1
        `, [newComment.rows[0].id]);

        // Create notification for post owner
        const post = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
        if (post.rows.length > 0 && post.rows[0].user_id !== userId) {
            const sender = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
            await createNotification(post.rows[0].user_id, userId, 'comment', `${sender.rows[0].username} commented on your post`, postId);
        }

        res.status(201).json({
            message: 'Comment added successfully!',
            comment: commentData.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add comment' });
    }
});

app.get('/api/posts/:id/comments', async (req, res) => {
    const postId = req.params.id;
    const viewerId = req.query.viewerId ? Number(req.query.viewerId) : 0;
    try {
        const comments = await pool.query(`
            SELECT 
                comments.*, 
                users.username,
                (SELECT COUNT(*) FROM comment_reactions WHERE comment_reactions.comment_id = comments.id) as reactions_count,
                (
                    SELECT json_object_agg(reaction_type, cnt) 
                    FROM (
                        SELECT reaction_type, COUNT(*) as cnt 
                        FROM comment_reactions 
                        WHERE comment_reactions.comment_id = comments.id 
                        GROUP BY reaction_type
                    ) x
                ) as reactions_summary,
                (SELECT reaction_type FROM comment_reactions WHERE comment_reactions.comment_id = comments.id AND comment_reactions.user_id = $2) as viewer_reaction
            FROM comments 
            JOIN users ON comments.user_id = users.id 
            WHERE post_id = $1 
            ORDER BY created_at ASC
        `, [postId, viewerId]);
        res.json(comments.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch comments' });
    }
});

// React to a comment
app.post('/api/comments/:id/react', async (req, res) => {
    const { userId, reactionType } = req.body;
    const commentId = req.params.id;
    const type = reactionType || 'like';
    try {
        const checkReact = await pool.query('SELECT * FROM comment_reactions WHERE user_id = $1 AND comment_id = $2', [userId, commentId]);
        if (checkReact.rows.length > 0) {
            if (checkReact.rows[0].reaction_type === type) {
                // Same reaction: toggle off
                await pool.query('DELETE FROM comment_reactions WHERE user_id = $1 AND comment_id = $2', [userId, commentId]);
                res.status(200).json({ message: 'Removed', reaction: null });
            } else {
                // Different reaction: update it
                await pool.query('UPDATE comment_reactions SET reaction_type = $1 WHERE user_id = $2 AND comment_id = $3', [type, userId, commentId]);
                res.status(200).json({ message: 'Updated', reaction: type });
            }
        } else {
            // New reaction
            await pool.query('INSERT INTO comment_reactions (user_id, comment_id, reaction_type) VALUES ($1, $2, $3)', [userId, commentId, type]);
            
            // Create notification for comment owner
            const comment = await pool.query('SELECT user_id, post_id FROM comments WHERE id = $1', [commentId]);
            if (comment.rows.length > 0 && comment.rows[0].user_id !== userId) {
                const sender = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
                await createNotification(comment.rows[0].user_id, userId, 'comment', `${sender.rows[0].username} reacted to your comment`, comment.rows[0].post_id);
            }
            res.status(200).json({ message: 'Reacted', reaction: type });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to react to comment' });
    }
});

// ============================================================
// --- Friend Routes ---
// ============================================================

// Send a friend request
app.post('/api/friends/request', async (req, res) => {
    const { userId, friendId } = req.body;
    const [id1, id2] = userId < friendId ? [userId, friendId] : [friendId, userId];
    try {
        await pool.query(
            'INSERT INTO friends (user_id1, user_id2, action_user_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
            [id1, id2, userId, 'pending']
        );
        // Create notification
        const sender = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
        await createNotification(friendId, userId, 'friend_request', `${sender.rows[0].username} sent you a friend request`);
        res.status(200).json({ message: 'Friend request sent' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send friend request' });
    }
});

// Accept a friend request
app.post('/api/friends/accept', async (req, res) => {
    const { userId, friendId } = req.body;
    const [id1, id2] = userId < friendId ? [userId, friendId] : [friendId, userId];
    try {
        await pool.query(
            'UPDATE friends SET status = $1 WHERE user_id1 = $2 AND user_id2 = $3',
            ['accepted', id1, id2]
        );
        const sender = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
        await createNotification(friendId, userId, 'friend_accept', `${sender.rows[0].username} accepted your friend request`);
        res.status(200).json({ message: 'Friend request accepted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to accept friend request' });
    }
});

// Reject a friend request
app.post('/api/friends/reject', async (req, res) => {
    const { userId, friendId } = req.body;
    const [id1, id2] = userId < friendId ? [userId, friendId] : [friendId, userId];
    try {
        await pool.query(
            'DELETE FROM friends WHERE user_id1 = $1 AND user_id2 = $2 AND status = $3',
            [id1, id2, 'pending']
        );
        res.status(200).json({ message: 'Friend request rejected' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to reject friend request' });
    }
});

// Block a user
app.post('/api/friends/block', async (req, res) => {
    const { userId, blockId } = req.body;
    const [id1, id2] = userId < blockId ? [userId, blockId] : [blockId, userId];
    try {
        await pool.query(
            'INSERT INTO friends (user_id1, user_id2, action_user_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT (user_id1, user_id2) DO UPDATE SET status = $4, action_user_id = $3',
            [id1, id2, userId, 'blocked']
        );
        res.status(200).json({ message: 'User blocked' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to block user' });
    }
});

// Unblock a user
app.post('/api/friends/unblock', async (req, res) => {
    const { userId, blockId } = req.body;
    const [id1, id2] = userId < blockId ? [userId, blockId] : [blockId, userId];
    try {
        await pool.query(
            'DELETE FROM friends WHERE user_id1 = $1 AND user_id2 = $2 AND action_user_id = $3 AND status = $4',
            [id1, id2, userId, 'blocked']
        );
        res.status(200).json({ message: 'User unblocked' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to unblock user' });
    }
});

// Search users and include friend status
app.get('/api/users/search', async (req, res) => {
    const { q, currentUserId } = req.query;
    if (!q || !currentUserId) return res.status(400).json({ error: 'Missing query parameters' });
    try {
        const users = await pool.query(`
            SELECT 
                u.id, u.username, u.profile_pic,
                f.status as friend_status,
                CASE 
                    WHEN f.action_user_id = $2 THEN 'sent'
                    ELSE 'received'
                END as request_direction
            FROM users u
            LEFT JOIN friends f ON (f.user_id1 = LEAST(u.id, $2::int) AND f.user_id2 = GREATEST(u.id, $2::int))
            WHERE u.username ILIKE $1 AND u.id != $2
            AND (f.status IS NULL OR f.status != 'blocked')
            LIMIT 20
        `, [`%${q}%`, currentUserId]);
        res.json(users.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to search users' });
    }
});

// Get the list of friends for a user
app.get('/api/friends/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const friends = await pool.query(`
            SELECT users.id, users.username, users.profile_pic 
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

// Get pending friend requests for a user
app.get('/api/friends/requests/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const requests = await pool.query(`
            SELECT users.id, users.username, users.profile_pic, friends.created_at
            FROM friends 
            JOIN users ON (
                CASE 
                    WHEN friends.user_id1 = $1 THEN friends.user_id2 = users.id
                    ELSE friends.user_id1 = users.id
                END
            )
            WHERE (friends.user_id1 = $1 OR friends.user_id2 = $1) 
            AND friends.status = 'pending'
            AND friends.action_user_id != $1
            AND users.id != $1
        `, [userId]);
        res.json(requests.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch friend requests' });
    }
});

// Get suggested friends (users not yet friends with)
app.get('/api/friends/suggestions/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const suggestions = await pool.query(`
            SELECT id, username, profile_pic FROM users 
            WHERE id != $1 
            AND id NOT IN (
                SELECT CASE WHEN user_id1 = $1 THEN user_id2 ELSE user_id1 END
                FROM friends WHERE user_id1 = $1 OR user_id2 = $1
            )
            LIMIT 10
        `, [userId]);
        res.json(suggestions.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
});

// ============================================================
// --- Share Routes ---
// ============================================================

app.post('/api/posts/:id/share', async (req, res) => {
    const { userId } = req.body;
    const postId = req.params.id;
    try {
        await pool.query('INSERT INTO shares (user_id, post_id) VALUES ($1, $2)', [userId, postId]);
        // Create notification
        const post = await pool.query('SELECT user_id FROM posts WHERE id = $1', [postId]);
        if (post.rows.length > 0 && post.rows[0].user_id !== userId) {
            const sender = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
            await createNotification(post.rows[0].user_id, userId, 'share', `${sender.rows[0].username} shared your post`, postId);
        }
        res.status(200).json({ message: 'Shared' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to share post' });
    }
});

// ============================================================
// --- Story Routes ---
// ============================================================

app.post('/api/stories', async (req, res) => {
    const { userId, content, imageUrl } = req.body;
    try {
        const newStory = await pool.query(
            'INSERT INTO stories (user_id, content, image_url) VALUES ($1, $2, $3) RETURNING *',
            [userId, content, imageUrl || null]
        );
        // Emit new story event to all connected clients
        if (socket) {
            socket.emit('new-story', newStory.rows[0]);
        }
        res.status(201).json({ message: 'Story created!', story: newStory.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create story' });
    }
});

app.get('/api/stories', async (req, res) => {
    try {
        const stories = await pool.query(`
            SELECT stories.*, users.username, users.profile_pic 
            FROM stories 
            JOIN users ON stories.user_id = users.id 
            WHERE stories.expires_at > NOW()
            ORDER BY stories.created_at DESC
        `);
        res.json(stories.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stories' });
    }
});

// ============================================================
// --- Reel Routes ---
// ============================================================

app.post('/api/reels', async (req, res) => {
    const { userId, videoUrl, caption } = req.body;
    try {
        const newReel = await pool.query(
            'INSERT INTO reels (user_id, video_url, caption) VALUES ($1, $2, $3) RETURNING *',
            [userId, videoUrl || null, caption]
        );
        res.status(201).json({ message: 'Reel created!', reel: newReel.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create reel' });
    }
});

app.get('/api/reels', async (req, res) => {
    try {
        const reels = await pool.query(`
            SELECT reels.*, users.username, users.profile_pic 
            FROM reels 
            JOIN users ON reels.user_id = users.id 
            ORDER BY reels.created_at DESC
        `);
        res.json(reels.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch reels' });
    }
});

// ============================================================
// --- Note Routes ---
// ============================================================

app.post('/api/notes', async (req, res) => {
    const { userId, content } = req.body;
    try {
        const newNote = await pool.query(
            'INSERT INTO notes (user_id, content) VALUES ($1, $2) RETURNING *',
            [userId, content]
        );
        res.status(201).json({ message: 'Note created!', note: newNote.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create note' });
    }
});

app.get('/api/notes', async (req, res) => {
    try {
        const notes = await pool.query(`
            SELECT notes.*, users.username, users.profile_pic 
            FROM notes 
            JOIN users ON notes.user_id = users.id 
            ORDER BY notes.created_at DESC
        `);
        res.json(notes.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch notes' });
    }
});

// ============================================================
// --- Notification Routes ---
// ============================================================

app.get('/api/notifications/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const notifications = await pool.query(`
            SELECT notifications.*, users.username as sender_username, users.profile_pic as sender_pic
            FROM notifications 
            LEFT JOIN users ON notifications.sender_id = users.id 
            WHERE notifications.user_id = $1 
            ORDER BY notifications.created_at DESC
            LIMIT 50
        `, [userId]);
        res.json(notifications.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Get unread notification count
app.get('/api/notifications/:userId/unread-count', async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = FALSE',
            [userId]
        );
        res.json({ count: parseInt(result.rows[0].count) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to get notification count' });
    }
});

// Mark notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE id = $1', [req.params.id]);
        res.json({ message: 'Notification marked as read' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update notification' });
    }
});

// Mark all notifications as read for a user
app.put('/api/notifications/:userId/read-all', async (req, res) => {
    try {
        await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1', [req.params.userId]);
        res.json({ message: 'All notifications marked as read' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update notifications' });
    }
});

// ============================================================
// --- Message Routes ---
// ============================================================

// Send a message
app.post('/api/messages', async (req, res) => {
    const { senderId, receiverId, content, messageType, mediaUrl } = req.body;
    const mType = messageType || 'text';
    try {
        const newMsg = await pool.query(
            'INSERT INTO messages (sender_id, receiver_id, content, message_type, media_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [senderId, receiverId, content, mType, mediaUrl || null]
        );
        // Create notification for the receiver
        const sender = await pool.query('SELECT username FROM users WHERE id = $1', [senderId]);
        if (mType !== 'call_log') {
            await createNotification(receiverId, senderId, 'message', `${sender.rows[0].username} sent you a message`);
        }
        
        // Emit real-time message via WebSockets
        const receiverSocketId = userSockets.get(Number(receiverId));
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('message', newMsg.rows[0]);
        }

        // Check if receiver is a bot
        const receiver = await pool.query('SELECT is_bot FROM users WHERE id = $1', [receiverId]);
        if (receiver.rows.length > 0 && receiver.rows[0].is_bot && mType === 'text') {
            // Find bot response
            const responses = await pool.query('SELECT * FROM bot_responses WHERE bot_id = $1', [receiverId]);
            let replyText = "I'm an automated assistant. Could you rephrase your question?";
            for (let row of responses.rows) {
                if (content.toLowerCase().includes(row.keyword.toLowerCase())) {
                    replyText = row.response_text;
                    break;
                }
            }
            
            // Send auto-reply after 1.5 seconds
            setTimeout(async () => {
                try {
                    const botReply = await pool.query(
                        'INSERT INTO messages (sender_id, receiver_id, content, message_type) VALUES ($1, $2, $3, $4) RETURNING *',
                        [receiverId, senderId, replyText, 'text']
                    );
                    const senderSocketId = userSockets.get(Number(senderId));
                    if (senderSocketId) {
                        io.to(senderSocketId).emit('message', botReply.rows[0]);
                    }
                    await createNotification(senderId, receiverId, 'message', `Bot replied to you`);
                } catch(e) {
                    console.error("Bot reply error", e);
                }
            }, 1500);
        }

        res.status(201).json({ message: 'Message sent!', data: newMsg.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to send message' });
    }
});

// Mark message as read with exact timestamp
app.put('/api/messages/:id/read-exact', async (req, res) => {
    try {
        const time = new Date();
        const result = await pool.query(
            'UPDATE messages SET is_read = TRUE, read_at = $1 WHERE id = $2 AND is_read = FALSE RETURNING *',
            [time, req.params.id]
        );
        res.json({ message: 'Message marked as read', read_at: time });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update message' });
    }
});

// Get list of conversations for a user
app.get('/api/messages/conversations/:userId', async (req, res) => {
    const { userId } = req.params;
    try {
        const conversations = await pool.query(`
            SELECT DISTINCT ON (other_user_id)
                other_user_id,
                users.username,
                users.profile_pic,
                last_message,
                last_time,
                unread_count
            FROM (
                SELECT 
                    CASE WHEN sender_id = $1 THEN receiver_id ELSE sender_id END as other_user_id,
                    content as last_message,
                    created_at as last_time,
                    (SELECT COUNT(*) FROM messages m2 
                     WHERE m2.sender_id = CASE WHEN messages.sender_id = $1 THEN messages.receiver_id ELSE messages.sender_id END
                     AND m2.receiver_id = $1 AND m2.is_read = FALSE) as unread_count
                FROM messages
                WHERE sender_id = $1 OR receiver_id = $1
                ORDER BY created_at DESC
            ) sub
            JOIN users ON users.id = sub.other_user_id
            ORDER BY other_user_id, last_time DESC
        `, [userId]);
        res.json(conversations.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch conversations' });
    }
});

// Get conversation between two users
app.get('/api/messages/:userId/:otherId', async (req, res) => {
    const { userId, otherId } = req.params;
    try {
        const messages = await pool.query(`
            SELECT messages.*, 
                   sender.username as sender_username,
                   receiver.username as receiver_username
            FROM messages 
            JOIN users sender ON messages.sender_id = sender.id
            JOIN users receiver ON messages.receiver_id = receiver.id
            WHERE (messages.sender_id = $1 AND messages.receiver_id = $2) 
               OR (messages.sender_id = $2 AND messages.receiver_id = $1)
            ORDER BY messages.created_at ASC
        `, [userId, otherId]);
        // Mark messages as read
        await pool.query(
            'UPDATE messages SET is_read = TRUE WHERE sender_id = $1 AND receiver_id = $2 AND is_read = FALSE',
            [otherId, userId]
        );
        res.json(messages.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
});

// ============================================================
// --- Marketplace Routes ---
// ============================================================

// List a new item
app.post('/api/marketplace', async (req, res) => {
    const { userId, itemName, description, price, imageUrl, category } = req.body;
    try {
        const newItem = await pool.query(
            'INSERT INTO marketplace (user_id, item_name, description, price, image_url, category) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [userId, itemName, description, price, imageUrl || null, category || 'General']
        );
        res.status(201).json({ message: 'Item listed!', item: newItem.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to list item' });
    }
});

// Get all marketplace items
app.get('/api/marketplace', async (req, res) => {
    try {
        const items = await pool.query(`
            SELECT marketplace.*, users.username, users.profile_pic 
            FROM marketplace 
            JOIN users ON marketplace.user_id = users.id 
            WHERE marketplace.status = 'available'
            ORDER BY marketplace.created_at DESC
        `);
        res.json(items.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch marketplace items' });
    }
});

// Get all users
app.get('/api/users', async (req, res) => {
    try {
        const users = await pool.query('SELECT id, username, profile_pic FROM users ORDER BY username');
        res.json(users.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Get specific user by ID
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await pool.query(`
            SELECT id, username, email, profile_pic, bio, 
                   privacy_settings, notification_settings, appearance_settings, created_at 
            FROM users WHERE id = $1
        `, [req.params.id]);
        if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(user.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Update user profile
app.put('/api/users/:id', async (req, res) => {
    const { username, bio, profilePic } = req.body;
    try {
        const result = await pool.query(
            'UPDATE users SET username = $1, bio = $2, profile_pic = $3 WHERE id = $4 RETURNING id, username, bio, profile_pic',
            [username, bio, profilePic, req.params.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'Profile updated!', user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// Update user settings
app.put('/api/users/:id/settings', async (req, res) => {
    const { privacy, notifications, appearance } = req.body;
    try {
        const result = await pool.query(
            'UPDATE users SET privacy_settings = $1, notification_settings = $2, appearance_settings = $3 WHERE id = $4 RETURNING *',
            [privacy, notifications, appearance, req.params.id]
        );
        res.json({ message: 'Settings updated!', settings: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});

// Update account (email/password)
app.put('/api/users/:id/account', async (req, res) => {
    const { email, password } = req.body;
    try {
        let query = 'UPDATE users SET email = $1';
        let params = [email];
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = $2';
            params.push(hashedPassword);
        }
        query += ` WHERE id = $${params.length + 1} RETURNING id, email`;
        params.push(req.params.id);
        
        const result = await pool.query(query, params);
        res.json({ message: 'Account updated!', user: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update account' });
    }
});

// Delete account
app.delete('/api/users/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ message: 'Account deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

// Get posts for a specific user
app.get('/api/users/:id/posts', async (req, res) => {
    const viewerId = req.query.viewerId ? Number(req.query.viewerId) : 0;
    const targetUserId = Number(req.params.id);
    try {
        const posts = await pool.query(`
            SELECT 
                posts.*, 
                users.username,
                users.profile_pic,
                (SELECT COUNT(*) FROM likes WHERE likes.post_id = posts.id) as likes_count,
                (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comments_count,
                (SELECT reaction_type FROM likes WHERE likes.post_id = posts.id AND likes.user_id = $2) as viewer_reaction,
                (
                    SELECT json_object_agg(reaction_type, cnt) 
                    FROM (
                        SELECT reaction_type, COUNT(*) as cnt 
                        FROM likes 
                        WHERE likes.post_id = posts.id 
                        GROUP BY reaction_type
                    ) x
                ) as reactions_summary
            FROM posts 
            JOIN users ON posts.user_id = users.id 
            WHERE posts.user_id = $1
              AND (
                  posts.privacy = 'public'
                  OR posts.user_id = $2
                  OR (posts.privacy = 'friends' AND EXISTS (
                      SELECT 1 FROM friends 
                      WHERE ((user_id1 = posts.user_id AND user_id2 = $2) OR (user_id1 = $2 AND user_id2 = posts.user_id))
                        AND status = 'accepted'
                  ))
                  OR (posts.privacy = 'close_friends' AND EXISTS (
                      SELECT 1 FROM close_friends
                      WHERE user_id = posts.user_id AND friend_id = $2
                  ))
              )
            ORDER BY posts.created_at DESC
        `, [targetUserId, viewerId]);
        res.json(posts.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch user posts' });
    }
});

// Search users and posts
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: 'Query required' });
    try {
        const users = await pool.query(
            'SELECT id, username, profile_pic FROM users WHERE username ILIKE $1 LIMIT 5',
            [`%${query}%`]
        );
        const posts = await pool.query(
            'SELECT posts.*, users.username FROM posts JOIN users ON posts.user_id = users.id WHERE content ILIKE $1 AND post_type = \'post\' LIMIT 5',
            [`%${query}%`]
        );
        res.json({ users: users.rows, posts: posts.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Search failed' });
    }
});

// ============================================================
// --- Close Friends Routes ---
// ============================================================

// Get list of close friends for a user
app.get('/api/users/:id/close-friends', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT friend_id FROM close_friends WHERE user_id = $1',
            [req.params.id]
        );
        res.json(result.rows.map(row => row.friend_id));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch close friends' });
    }
});

// Add a friend to close friends list
app.post('/api/users/:id/close-friends', async (req, res) => {
    const { friendId } = req.body;
    try {
        await pool.query(
            'INSERT INTO close_friends (user_id, friend_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [req.params.id, friendId]
        );
        res.status(200).json({ message: 'Added to Close Friends' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to add close friend' });
    }
});

// Remove a friend from close friends list
app.delete('/api/users/:id/close-friends/:friendId', async (req, res) => {
    try {
        await pool.query(
            'DELETE FROM close_friends WHERE user_id = $1 AND friend_id = $2',
            [req.params.id, req.params.friendId]
        );
        res.status(200).json({ message: 'Removed from Close Friends' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to remove close friend' });
    }
});

// Start the server
const fs = require('fs');
// ... existing requires ...
// Start cleanup job for expired stories (runs every hour)
setInterval(async () => {
    try {
        const result = await pool.query('SELECT id, image_url FROM stories WHERE expires_at <= NOW()');
        for (const row of result.rows) {
            if (row.image_url) {
                const filePath = `uploads/${row.image_url}`; // assuming image_url is filename
                fs.unlink(filePath, err => {
                    if (err) console.error('Failed to delete expired story file', err);
                });
            }
        }
        await pool.query('DELETE FROM stories WHERE expires_at <= NOW()');
        console.log('Expired stories cleaned up');
    } catch (e) {
        console.error('Error during story cleanup', e);
    }
}, 60 * 60 * 1000); // every hour

server.listen(PORT, () => {
    console.log('Server running on port ' + PORT);
});
