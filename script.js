
const API = "http://localhost:5000/api";

let token = localStorage.getItem("connecthub_token") || "";
let currentUser = null;
let authMode = "login";
let posts = [];

const $ = (id) => document.getElementById(id);

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[char]);
}

function getErrorMessage(data, fallback) {
    return data?.message || data?.error || fallback;
}

async function request(path, options = {}) {
    const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers
    };

    const response = await fetch(`${API}${path}`, {
        ...options,
        headers
    });

    const text = await response.text();
    let data = {};

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        data = { message: text };
    }

    if (!response.ok || data.success === false) {
        throw new Error(getErrorMessage(data, `Request failed (${response.status})`));
    }

    return data;
}

function getList(data, key) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.[key])) return data[key];
    return [];
}

function getUserId(data) {
    const user = data?.user || data?.data?.user || data?.data || data;
    const directId = user?.id ?? user?.userId ?? user?.user_id ??
        data?.userId ?? data?.user_id;

    if (directId != null) return Number(directId);

    // Fallback for a JWT whose payload contains the user ID.
    try {
        const payload = JSON.parse(atob(
            token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
        ));
        const id = payload.id ?? payload.userId ?? payload.user_id ?? payload.sub;
        if (id != null && Number.isFinite(Number(id))) return Number(id);
    } catch {
        // The backend may use a different token format.
    }

    return null;
}

function setMessage(id, message, isError = false) {
    const element = $(id);
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#d14343" : "";
}

function setAuthMode(mode) {
    authMode = mode;
    $("loginTab").classList.toggle("active", mode === "login");
    $("registerTab").classList.toggle("active", mode === "register");
    $("usernameField").classList.toggle("hidden", mode !== "register");
    $("authUsername").required = mode === "register";
    $("authSubmit").textContent = mode === "login" ? "Login" : "Create Account";
    setMessage("authMessage", "");
}

$("loginTab").addEventListener("click", () => setAuthMode("login"));
$("registerTab").addEventListener("click", () => setAuthMode("register"));

$("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = $("authEmail").value.trim();
    const password = $("authPassword").value;
    const username = $("authUsername").value.trim();

    if (authMode === "register" && !username) {
        setMessage("authMessage", "Please enter a username.", true);
        return;
    }

    $("authSubmit").disabled = true;
    setMessage("authMessage", "Please wait...");

    try {
        const data = await request(
            authMode === "login" ? "/login" : "/register",
            {
                method: "POST",
                body: JSON.stringify(
                    authMode === "login"
                        ? { email, password }
                        : { username, email, password }
                )
            }
        );

        if (authMode === "register") {
            setMessage("authMessage", "Account created! Please log in.");
            $("authForm").reset();
            setAuthMode("login");
            return;
        }

        if (!data.token) {
            throw new Error("Login succeeded but no token was returned by the server.");
        }

        token = data.token;
        localStorage.setItem("connecthub_token", token);

        currentUser = {
            id: getUserId(data),
            ...(data.user || {})
        };

        $("authForm").reset();
        setMessage("authMessage", "");
        await showApp();
    } catch (error) {
        setMessage("authMessage", error.message, true);
    } finally {
        $("authSubmit").disabled = false;
    }
});

async function loadProfile() {
    if (!currentUser?.id) {
        throw new Error("User ID was not returned. Please log in again.");
    }

    const data = await request(`/users/${currentUser.id}`);
    const profile = data.user || data.profile || data.data?.user ||
        data.data || data;

    currentUser = { ...currentUser, ...profile };

    $("sideUsername").textContent = currentUser.username || "My Profile";
    $("sideBio").textContent = currentUser.bio || "No bio added yet.";
    $("sideAvatar").innerHTML = currentUser.profile_image
        ? `<img src="${escapeHTML(currentUser.profile_image)}" alt="Profile"
             onerror="this.remove()">`
        : escapeHTML((currentUser.username || "U").charAt(0).toUpperCase());

    $("followerCount").textContent = currentUser.follower_count ?? 0;
    $("followingCount").textContent = currentUser.following_count ?? 0;
}

async function showApp() {
    $("authPanel").classList.add("hidden");
    $("appPanel").classList.remove("hidden");
    $("logoutBtn").classList.remove("hidden");
    $("welcomeText").textContent = "Welcome to your community!";

    try {
        await loadProfile();
        await loadPosts();
    } catch (error) {
        if (/token|unauthorized|jwt|user id/i.test(error.message)) {
            logout();
            setMessage("authMessage", "Please log in again.", true);
        } else {
            setMessage("postMessage", error.message, true);
        }
    }
}

async function loadPosts() {
    $("postsContainer").innerHTML =
        '<div class="card empty">Loading posts...</div>';

    try {
        const data = await request("/posts");
        posts = getList(data, "posts");

        $("postCount").textContent = posts.filter(
            (post) => Number(post.user_id) === Number(currentUser?.id)
        ).length;

        if (!posts.length) {
            $("postsContainer").innerHTML =
                '<div class="card empty">No posts yet. Be the first to share something!</div>';
            return;
        }

        $("postsContainer").innerHTML = posts.map(renderPost).join("");

        // Load each post's comments and like status.
        await Promise.all(posts.map(async (post) => {
            await loadLikeStatus(post.id);
        }));
    } catch (error) {
        $("postsContainer").innerHTML =
            `<div class="card empty">${escapeHTML(error.message)}</div>`;
    }
}

function renderPost(post) {
    const isOwnPost = Number(post.user_id) === Number(currentUser?.id);
    const username = post.username || `User ${post.user_id}`;
    const avatar = post.profile_image
        ? `<img src="${escapeHTML(post.profile_image)}" alt=""
             onerror="this.remove()">`
        : escapeHTML(username.charAt(0).toUpperCase());

    const date = post.created_at
        ? new Date(post.created_at.replace(" ", "T") + (
            /(?:Z|[+-]\d{2}:?\d{2})$/i.test(post.created_at) ? "" : "Z"
        )).toLocaleString()
        : "";

    return `
        <article class="card post-card" data-post-id="${Number(post.id)}">
            <div class="post-header">
                <div class="post-avatar">${avatar}</div>
                <div class="post-author">
                    <strong>${escapeHTML(username)}</strong>
                    <span class="post-date">${escapeHTML(date)}</span>
                </div>
                ${isOwnPost ? `
                    <button class="action-btn delete-post"
                        data-id="${Number(post.id)}">Delete</button>
                ` : `
                    <button class="action-btn follow-btn"
                        data-user-id="${Number(post.user_id)}">Follow</button>
                `}
            </div>

            <div class="post-content">${escapeHTML(post.content || "")}</div>

            <div class="post-stats">
                <span class="like-count">${Number(post.like_count ?? post.likes_count ?? 0)}</span> likes
                &nbsp; · &nbsp;
                <span class="comment-count">${Number(post.comment_count ?? post.comments_count ?? 0)}</span> comments
            </div>

            <div class="post-actions">
                <button class="action-btn like-btn" data-id="${Number(post.id)}">Like</button>
                <button class="action-btn comments-toggle" data-id="${Number(post.id)}">Comments</button>
            </div>

            <section class="comments hidden" id="comments-${Number(post.id)}">
                <h4>Comments</h4>
                <div class="comments-list">Loading comments...</div>
                <form class="comment-form" data-id="${Number(post.id)}">
                    <input name="content" maxlength="1000"
                        placeholder="Write a comment..." required>
                    <button class="btn" type="submit">Send</button>
                </form>
                <p class="message comment-message"></p>
            </section>
        </article>
    `;
}

async function loadLikeStatus(postId) {
    const button = document.querySelector(
        `.like-btn[data-id="${Number(postId)}"]`
    );
    if (!button) return;

    try {
        const data = await request(`/posts/${postId}/like-status`);
        const liked = Boolean(data.liked ?? data.isLiked ?? data.hasLiked);
        button.classList.toggle("liked", liked);
        button.textContent = liked ? "Liked" : "Like";
    } catch {
        // Keep the default Like button if status is unavailable.
    }
}

$("postForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const content = $("postContent").value.trim();
    if (!content) return;

    const submitButton = $("postForm").querySelector('button[type="submit"]');
    submitButton.disabled = true;

    try {
        await request("/posts", {
            method: "POST",
            body: JSON.stringify({ content })
        });

        $("postForm").reset();
        setMessage("postMessage", "Post published successfully!");
        await loadPosts();
        await loadProfile();
    } catch (error) {
        setMessage("postMessage", error.message, true);
    } finally {
        submitButton.disabled = false;
    }
});

$("refreshBtn").addEventListener("click", loadPosts);

$("postsContainer").addEventListener("click", async (event) => {
    const likeButton = event.target.closest(".like-btn");
    const commentsButton = event.target.closest(".comments-toggle");
    const deleteButton = event.target.closest(".delete-post");
    const followButton = event.target.closest(".follow-btn");

    if (likeButton) {
        const postId = likeButton.dataset.id;
        const wasLiked = likeButton.classList.contains("liked");

        likeButton.disabled = true;

        try {
            await request(`/posts/${postId}/like`, {
                method: wasLiked ? "DELETE" : "POST"
            });
            await loadPosts();
        } catch (error) {
            alert(error.message);
        } finally {
            likeButton.disabled = false;
        }
    }

    if (commentsButton) {
        const postId = commentsButton.dataset.id;
        const panel = $(`comments-${postId}`);
        panel.classList.toggle("hidden");

        if (!panel.classList.contains("hidden")) {
            await loadComments(postId);
        }
    }

    if (deleteButton) {
        const postId = deleteButton.dataset.id;
        if (!confirm("Are you sure you want to delete this post?")) return;

        try {
            await request(`/posts/${postId}`, { method: "DELETE" });
            await loadPosts();
            await loadProfile();
        } catch (error) {
            alert(error.message);
        }
    }

    if (followButton) {
        const userId = followButton.dataset.userId;
        const wasFollowing = followButton.dataset.following === "true";

        followButton.disabled = true;

        try {
            await request(`/users/${userId}/follow`, {
                method: wasFollowing ? "DELETE" : "POST"
            });
            await loadProfile();
            await loadPosts();
        } catch (error) {
            alert(error.message);
        } finally {
            followButton.disabled = false;
        }
    }
});

async function loadComments(postId) {
    const panel = $(`comments-${postId}`);
    const list = panel.querySelector(".comments-list");
    list.textContent = "Loading comments...";

    try {
        const data = await request(`/posts/${postId}/comments`);
        const comments = getList(data, "comments");

        list.innerHTML = comments.length
            ? comments.map((comment) => `
                <div class="comment-item">
                    <strong>${escapeHTML(comment.username || "User")}</strong>
                    ${escapeHTML(comment.content || comment.text || "")}
                </div>
            `).join("")
            : '<p class="hint">No comments yet. Start the conversation!</p>';
    } catch (error) {
        list.textContent = error.message;
    }
}

$("postsContainer").addEventListener("submit", async (event) => {
    const form = event.target.closest(".comment-form");
    if (!form) return;

    event.preventDefault();

    const postId = form.dataset.id;
    const input = form.elements.content;
    const content = input.value.trim();
    if (!content) return;

    const button = form.querySelector("button[type='submit']");
    button.disabled = true;

    try {
        await request(`/posts/${postId}/comments`, {
            method: "POST",
            body: JSON.stringify({ content })
        });

        input.value = "";
        await loadComments(postId);
        await loadPosts();
    } catch (error) {
        form.nextElementSibling.textContent = error.message;
    } finally {
        button.disabled = false;
    }
});

$("editProfileBtn").addEventListener("click", () => {
    $("profileUsername").value = currentUser?.username || "";
    $("profileBio").value = currentUser?.bio || "";
    $("profileImage").value = currentUser?.profile_image || "";
    setMessage("profileMessage", "");
    $("profileDialog").showModal();
});

$("cancelProfileBtn").addEventListener("click", () => {
    $("profileDialog").close();
});

$("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = $("profileUsername").value.trim();
    const bio = $("profileBio").value.trim();
    const profile_image = $("profileImage").value.trim();

    if (!username) {
        setMessage("profileMessage", "Username is required.", true);
        return;
    }

    try {
        await request("/users/profile", {
            method: "PUT",
            body: JSON.stringify({ username, bio, profile_image })
        });

        $("profileDialog").close();
        await loadProfile();
        await loadPosts();
    } catch (error) {
        setMessage("profileMessage", error.message, true);
    }
});

$("logoutBtn").addEventListener("click", logout);

function logout() {
    token = "";
    currentUser = null;
    posts = [];
    localStorage.removeItem("connecthub_token");

    $("authPanel").classList.remove("hidden");
    $("appPanel").classList.add("hidden");
    $("logoutBtn").classList.add("hidden");
    $("welcomeText").textContent = "Your community, your space";
    $("postsContainer").innerHTML = "";
    $("sideUsername").textContent = "Welcome!";
    $("sideBio").textContent = "Connect with your community.";
    $("sideAvatar").textContent = "C";
    $("postCount").textContent = "0";
    $("followerCount").textContent = "0";
    $("followingCount").textContent = "0";
    setAuthMode("login");
}

async function startApp() {
    if (!token) {
        $("authPanel").classList.remove("hidden");
        $("appPanel").classList.add("hidden");
        return;
    }

    try {
        const payload = JSON.parse(atob(
            token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")
        ));

        currentUser = {
            id: payload.id ?? payload.userId ?? payload.user_id ??
                (Number.isFinite(Number(payload.sub)) ? Number(payload.sub) : null),
            username: payload.username
        };
    } catch {
        currentUser = null;
    }

    if (!currentUser?.id) {
        // The profile endpoint requires the user ID. Ask the user to sign in again.
        logout();
        return;
    }

    await showApp();
}

startApp();
