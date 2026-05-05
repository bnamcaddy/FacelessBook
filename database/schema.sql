-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password TEXT NOT NULL,
    profile_pic TEXT DEFAULT 'https://via.placeholder.com/150',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Posts Table
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    image_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Likes Table
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id)
);

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Friends Table
CREATE TABLE IF NOT EXISTS friends (
    id SERIAL PRIMARY KEY,
    user_id1 INTEGER REFERENCES users(id) ON DELETE CASCADE,
    user_id2 INTEGER REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'accepted'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (user_id1 < user_id2), -- Prevent duplicate pairs
    UNIQUE(user_id1, user_id2)
);
