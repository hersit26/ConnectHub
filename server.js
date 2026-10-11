
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const db = require("./database");

const app = express();
const PORT = 5000;
const JWT_SECRET = "minisocialmedia_secret_key";

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(__dirname));

// Authentication middleware
function authenticateToken(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Authentication token required."
        });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: "Invalid or expired token."
            });
        }

        req.user = user;
        next();
    });
}

// HOME: Serve index.html
app.get("/", (req, res) => {
    const indexPath = path.join(__dirname, "index.html");

    if (!fs.existsSync(indexPath)) {
        return res.status(404).send(
            "index.html not found. Place index.html in the MiniSocialMedia project folder."
        );
    }

    res.sendFile(indexPath);
});

// Database test
app.get("/api/test-db", (req, res) => {
    db.get("SELECT 1 AS test", (err, row) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        res.json({
            success: true,
            message: "Database connection is working!",
            result: row.test
        });
    });
});

// Register
app.post("/api/register", async (req, res) => {
    try {
        const { username, email, password } = req.body;

        if (!username || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Username, email and password are required."
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                success: false,
                message: "Password must be at least 6 characters."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.run(
            `INSERT INTO users (username, email, password)
             VALUES (?, ?, ?)`,
            [username.trim(), email.trim(), hashedPassword],
            function (err) {
                if (err) {
                    if (err.message.includes("UNIQUE")) {
                        return res.status(409).json({
                            success: false,
                            message: "Username or email already exists."
                        });
                    }

                    return res.status(500).json({
                        success: false,
                        message: err.message
                    });
                }

                res.status(201).json({
                    success: true,
                    message: "Registration successful!",
                    userId: this.lastID
                });
            }
        );
    } catch (err) {
        res.status(500).json({
            success: false,
            message: "Server error."
        });
    }
});

// Login
app.post("/api/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required."
        });
    }

    db.get(
        "SELECT * FROM users WHERE email = ?",
        [email.trim()],
        async (err, user) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            if (!user || !(await bcrypt.compare(password, user.password))) {
                return res.status(401).json({
                    success: false,
                    message: "Invalid email or password."
                });
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    username: user.username,
                    email: user.email
                },
                JWT_SECRET,
                { expiresIn: "7d" }
            );

            res.json({
                success: true,
                message: "Login successful!",
                token,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    bio: user.bio,
                    profile_image: user.profile_image
                }
            });
        }
    );
});

// Create post
app.post("/api/posts", authenticateToken, (req, res) => {
    const { content } = req.body;

    if (!content || !content.trim()) {
        return res.status(400).json({
            success: false,
            message: "Post content is required."
        });
    }

    db.run(
        "INSERT INTO posts (user_id, content) VALUES (?, ?)",
        [req.user.id, content.trim()],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            res.status(201).json({
                success: true,
                message: "Post created successfully!",
                postId: this.lastID
            });
        }
    );
});

// Get all posts
app.get("/api/posts", (req, res) => {
    const sql = `
        SELECT p.id, p.content, p.created_at,
               u.id AS user_id, u.username, u.profile_image,
               (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
               (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
        FROM posts p
        INNER JOIN users u ON p.user_id = u.id
        ORDER BY p.created_at DESC
    `;

    db.all(sql, [], (err, posts) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        res.json({ success: true, posts });
    });
});

// Get single post
app.get("/api/posts/:id", (req, res) => {
    const sql = `
        SELECT p.id, p.content, p.created_at,
               u.id AS user_id, u.username, u.profile_image,
               (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
               (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
        FROM posts p
        INNER JOIN users u ON p.user_id = u.id
        WHERE p.id = ?
    `;

    db.get(sql, [req.params.id], (err, post) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found."
            });
        }

        res.json({ success: true, post });
    });
});

// Delete own post
app.delete("/api/posts/:id", authenticateToken, (req, res) => {
    db.run(
        "DELETE FROM posts WHERE id = ? AND user_id = ?",
        [req.params.id, req.user.id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            if (!this.changes) {
                return res.status(404).json({
                    success: false,
                    message: "Post not found or deletion not allowed."
                });
            }

            res.json({
                success: true,
                message: "Post deleted successfully!"
            });
        }
    );
});

// Add comment
app.post("/api/posts/:id/comments", authenticateToken, (req, res) => {
    const { content } = req.body;
    const postId = req.params.id;

    if (!content || !content.trim()) {
        return res.status(400).json({
            success: false,
            message: "Comment content is required."
        });
    }

    db.get("SELECT id FROM posts WHERE id = ?", [postId], (err, post) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found."
            });
        }

        db.run(
            `INSERT INTO comments (post_id, user_id, content)
             VALUES (?, ?, ?)`,
            [postId, req.user.id, content.trim()],
            function (insertErr) {
                if (insertErr) {
                    return res.status(500).json({
                        success: false,
                        message: insertErr.message
                    });
                }

                res.status(201).json({
                    success: true,
                    message: "Comment added successfully!",
                    commentId: this.lastID
                });
            }
        );
    });
});

// Get comments
app.get("/api/posts/:id/comments", (req, res) => {
    const sql = `
        SELECT c.id, c.content, c.created_at,
               u.id AS user_id, u.username, u.profile_image
        FROM comments c
        INNER JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ?
        ORDER BY c.created_at ASC
    `;

    db.all(sql, [req.params.id], (err, comments) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        res.json({ success: true, comments });
    });
});

// Like post
app.post("/api/posts/:id/like", authenticateToken, (req, res) => {
    const postId = req.params.id;

    db.get("SELECT id FROM posts WHERE id = ?", [postId], (err, post) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        if (!post) {
            return res.status(404).json({
                success: false,
                message: "Post not found."
            });
        }

        db.run(
            "INSERT INTO likes (post_id, user_id) VALUES (?, ?)",
            [postId, req.user.id],
            function (insertErr) {
                if (insertErr) {
                    if (insertErr.message.includes("UNIQUE")) {
                        return res.status(409).json({
                            success: false,
                            message: "You already liked this post."
                        });
                    }

                    return res.status(500).json({
                        success: false,
                        message: insertErr.message
                    });
                }

                db.get(
                    "SELECT COUNT(*) AS like_count FROM likes WHERE post_id = ?",
                    [postId],
                    (countErr, result) => {
                        if (countErr) {
                            return res.status(500).json({
                                success: false,
                                message: countErr.message
                            });
                        }

                        res.json({
                            success: true,
                            message: "Post liked successfully!",
                            likeCount: result.like_count
                        });
                    }
                );
            }
        );
    });
});

// Unlike post
app.delete("/api/posts/:id/like", authenticateToken, (req, res) => {
    const postId = req.params.id;

    db.run(
        "DELETE FROM likes WHERE post_id = ? AND user_id = ?",
        [postId, req.user.id],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            if (!this.changes) {
                return res.status(404).json({
                    success: false,
                    message: "You have not liked this post."
                });
            }

            db.get(
                "SELECT COUNT(*) AS like_count FROM likes WHERE post_id = ?",
                [postId],
                (countErr, result) => {
                    if (countErr) {
                        return res.status(500).json({
                            success: false,
                            message: countErr.message
                        });
                    }

                    res.json({
                        success: true,
                        message: "Post unliked successfully!",
                        likeCount: result.like_count
                    });
                }
            );
        }
    );
});

// Like status
app.get("/api/posts/:id/like-status", authenticateToken, (req, res) => {
    db.get(
        "SELECT id FROM likes WHERE post_id = ? AND user_id = ?",
        [req.params.id, req.user.id],
        (err, like) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            res.json({ success: true, liked: !!like });
        }
    );
});

// Follow user
app.post("/api/users/:id/follow", authenticateToken, (req, res) => {
    const followingId = parseInt(req.params.id, 10);
    const followerId = req.user.id;

    if (!Number.isInteger(followingId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid user ID."
        });
    }

    if (followerId === followingId) {
        return res.status(400).json({
            success: false,
            message: "You cannot follow yourself."
        });
    }

    db.get("SELECT id FROM users WHERE id = ?", [followingId], (err, user) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        db.run(
            "INSERT INTO followers (follower_id, following_id) VALUES (?, ?)",
            [followerId, followingId],
            function (insertErr) {
                if (insertErr) {
                    if (insertErr.message.includes("UNIQUE")) {
                        return res.status(409).json({
                            success: false,
                            message: "You are already following this user."
                        });
                    }

                    return res.status(500).json({
                        success: false,
                        message: insertErr.message
                    });
                }

                res.json({
                    success: true,
                    message: "User followed successfully!"
                });
            }
        );
    });
});

// Unfollow user
app.delete("/api/users/:id/follow", authenticateToken, (req, res) => {
    const followingId = parseInt(req.params.id, 10);

    db.run(
        "DELETE FROM followers WHERE follower_id = ? AND following_id = ?",
        [req.user.id, followingId],
        function (err) {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            if (!this.changes) {
                return res.status(404).json({
                    success: false,
                    message: "You are not following this user."
                });
            }

            res.json({
                success: true,
                message: "User unfollowed successfully!"
            });
        }
    );
});

// Follow status
app.get("/api/users/:id/follow-status", authenticateToken, (req, res) => {
    db.get(
        "SELECT id FROM followers WHERE follower_id = ? AND following_id = ?",
        [req.user.id, req.params.id],
        (err, follow) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            res.json({ success: true, following: !!follow });
        }
    );
});

// Get follower count
app.get("/api/users/:id/followers", (req, res) => {
    db.get(
        "SELECT COUNT(*) AS follower_count FROM followers WHERE following_id = ?",
        [req.params.id],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            res.json({
                success: true,
                followerCount: result.follower_count
            });
        }
    );
});

// Get following count
app.get("/api/users/:id/following", (req, res) => {
    db.get(
        "SELECT COUNT(*) AS following_count FROM followers WHERE follower_id = ?",
        [req.params.id],
        (err, result) => {
            if (err) {
                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            res.json({
                success: true,
                followingCount: result.following_count
            });
        }
    );
});

// Get user profile
app.get("/api/users/:id", (req, res) => {
    const sql = `
        SELECT u.id, u.username, u.email, u.bio, u.profile_image, u.created_at,
            (SELECT COUNT(*) FROM followers WHERE following_id = u.id) AS follower_count,
            (SELECT COUNT(*) FROM followers WHERE follower_id = u.id) AS following_count,
            (SELECT COUNT(*) FROM posts WHERE user_id = u.id) AS post_count
        FROM users u
        WHERE u.id = ?
    `;

    db.get(sql, [req.params.id], (err, user) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        res.json({ success: true, user });
    });
});

// Update own profile
app.put("/api/users/profile", authenticateToken, (req, res) => {
    const { username, bio, profile_image } = req.body;

    if (!username || !username.trim()) {
        return res.status(400).json({
            success: false,
            message: "Username is required."
        });
    }

    db.run(
        `UPDATE users SET username = ?, bio = ?, profile_image = ?
         WHERE id = ?`,
        [
            username.trim(),
            typeof bio === "string" ? bio.trim() : "",
            typeof profile_image === "string" ? profile_image.trim() : "",
            req.user.id
        ],
        function (err) {
            if (err) {
                if (err.message.includes("UNIQUE")) {
                    return res.status(409).json({
                        success: false,
                        message: "Username already exists."
                    });
                }

                return res.status(500).json({
                    success: false,
                    message: err.message
                });
            }

            if (!this.changes) {
                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });
            }

            res.json({
                success: true,
                message: "Profile updated successfully!"
            });
        }
    );
});

// Get user posts
app.get("/api/users/:id/posts", (req, res) => {
    const sql = `
        SELECT p.id, p.content, p.created_at,
               u.id AS user_id, u.username, u.profile_image,
               (SELECT COUNT(*) FROM likes l WHERE l.post_id = p.id) AS like_count,
               (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS comment_count
        FROM posts p
        INNER JOIN users u ON p.user_id = u.id
        WHERE p.user_id = ?
        ORDER BY p.created_at DESC
    `;

    db.all(sql, [req.params.id], (err, posts) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: err.message
            });
        }

        res.json({ success: true, posts });
    });
});

// Unknown API endpoint
app.use("/api", (req, res) => {
    res.status(404).json({
        success: false,
        message: "API endpoint not found."
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
