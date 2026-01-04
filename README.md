# Artify Server

The robust backend API for **Artify**, a digital art-sharing platform where communities connect through creativity. This server handles authentication synchronization, data management, and administrative operations.

🔗 **Live Client URL:** [https://artify-client.vercel.app/](https://artify-client.vercel.app/)

---

## 🚀 Key Features

### 🔐 User & Role Management

- **Auth Sync**: Seamlessly syncs user data (Name, Photo, Email) from frontend providers (Firebase) to MongoDB on every login.
- **Role-Based Access Control**: Distinct **Admin** and **User** roles.
- **Admin Powers**: Admins can promote/demote users and manage platform content.

### 📊 Admin Dashboard

- **Analytics Center**: Visual insights into User Growth and Art Upload trends over time.
- **Platform Health**: Real-time counters for Total Users, Public/Private Arts, and Reports.
- **User Management**: Table view to list all users, check their contribution stats, and manage roles.
- **Content Moderation**: Review reported/flagged artworks and take action (Delete/Ignore).

### 🎨 Art Management

- **CRUD Operations**: Complete creation, reading, updating, and deletion of digital art entries.
- **Visibility Control**: Users can set artworks as **Public** or **Private**.
- **Engagement**:
  - **Likes system**: Track popularity of artworks.
  - **Favorites**: Users can bookmark their favorite pieces.
- **Advanced Search**: Text-based search support for Art Titles and Artist Names.

---

## 🛠 Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (using Native Driver)
- **Deployment**: Vercel (Serverless ready)

---

## 🔌 API Endpoints

### User & Auth

- `POST /users`: Sync user data (Upsert logic).
- `GET /users`: Get all users (Admin only).
- `PATCH /users/:id/role`: Update user role (Admin only).
- `GET /users/admin/:email`: Check if a specific user is an admin.

### Artworks

- `GET /arts`: Get all public arts (supports `search`, `category`, `limit`, `page`).
- `POST /arts`: Upload new art.
- `GET /arts/:id`: Get single art details.
- `PATCH /arts/:id`: Update art info.
- `DELETE /arts/:id`: Delete art (cascade deletes reports/favorites).
- `GET /my-arts?email=...`: Get arts for a specific user.

### Engagement

- `PATCH /arts/:id/like`: Like an artwork.
- `PATCH /arts/:id/unlike`: Remove like.
- `POST /favorites`: Add to specific user's favorites.
- `GET /favorites?email=...`: List user's favorites.

### Admin Dashboard

- `GET /admin/stats`: Get comprehensive analytics (Growth charts, Counters).
- `GET /admin/reports`: List all content reports.
- `POST /reports`: Submit a new report against an artwork.
- `DELETE /admin/reports/:id`: Resolve a report.

---

## ⚙️ Local Setup

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd artify-server
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Configure Environment**
   Create a `.env` file in the root directory:

   ```env
   MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
   DB_NAME=artify
   PORT=3000
   ```

4. **Run Server**
   ```bash
   npm start
   ```

---

_Developed for the Artify Platform._
