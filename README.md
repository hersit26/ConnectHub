# ConnectHub – Social Media Web Application

ConnectHub is a simple social media web application where users can share posts, interact with community content, and connect with other users.

## Features

- User registration and login
- Create and view posts
- Like and unlike posts
- Comment on posts
- Follow and unfollow users
- User profiles and profile editing
- Followers and following information
- REST API integration
- SQLite database for storing application data

## Technologies Used

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** SQLite
- **Tools:** Visual Studio Code, Git, GitHub

## Project Structure

```text
ConnectHub/
├── database.js
├── index.html
├── package.json
├── package-lock.json
├── script.js
├── server.js
├── style.css
└── README.md
```

## Getting Started

### Prerequisites

- Node.js and npm installed
- Git (optional)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/hersit26/ConnectHub.git
   ```

2. Open the project folder:

   ```bash
   cd ConnectHub
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Start the server:

   ```bash
   node server.js
   ```

5. Open the application in your browser:

   http://localhost:5000

The application initializes its SQLite database through the backend. Check `database.js` and `server.js` if your local setup requires additional configuration.

## API Endpoints

The application provides REST API endpoints for authentication, posts, comments, likes, user profiles, and following relationships.

Example endpoints:

- `GET /api/posts` – Retrieve community posts
- `POST /api/posts` – Create a post (authentication required)
- `GET /api/users/:id` – Retrieve a user profile
- `POST /api/register` – Register a user
- `POST /api/login` – Log in a user

Refer to `server.js` for the implemented routes and their request requirements.

## Future Improvements

- Responsive design improvements
- Better error handling and validation
- Image uploads for posts and profiles
- Enhanced security and authentication
- Deployment to a public hosting platform

## Author

**Hersit Kumar Singh**

GitHub: [@hersit26](https://github.com/hersit26)

## License

This project is currently a personal learning project. A license can be added if the project is distributed publicly.