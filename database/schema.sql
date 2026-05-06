-- Database Schema for FacelessBook

-- Users Table: Stores user account information
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY, -- Unique identifier for each user
    username VARCHAR(50) UNIQUE NOT NULL, -- Unique display name
    email VARCHAR(100) UNIQUE NOT NULL, -- Unique email address for login
    password TEXT NOT NULL, -- Hashed password
    profile_pic TEXT DEFAULT 'https://via.placeholder.com/150', -- URL to profile picture
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Record creation timestamp
);

-- Posts Table: Stores content shared by users
CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY, -- Unique identifier for each post
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- ID of the user who created the post
    content TEXT NOT NULL, -- Text content of the post
    image_url TEXT, -- Optional URL for an image attached to the post
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP -- Post creation timestamp
);

-- Likes Table: Tracks which users liked which posts
CREATE TABLE IF NOT EXISTS likes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- User who liked the post
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE, -- The post being liked
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, post_id) -- Ensures a user can only like a post once
);

-- Comments Table: Stores replies to posts
CREATE TABLE IF NOT EXISTS comments (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- User who wrote the comment
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE, -- The post being commented on
    content TEXT NOT NULL, -- Text content of the comment
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Friends Table: Manages social connections between users
CREATE TABLE IF NOT EXISTS friends (
    id SERIAL PRIMARY KEY,
    user_id1 INTEGER REFERENCES users(id) ON DELETE CASCADE, -- First user in the relationship
    user_id2 INTEGER REFERENCES users(id) ON DELETE CASCADE, -- Second user in the relationship
    status VARCHAR(20) DEFAULT 'pending', -- Status: 'pending' (requested) or 'accepted' (friends)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CHECK (user_id1 < user_id2), -- Logic to prevent duplicate pairs (e.g., 1-2 and 2-1)
    UNIQUE(user_id1, user_id2) -- Ensures only one relationship record exists between two users
);

