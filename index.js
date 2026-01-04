require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017";

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: false,
    deprecationErrors: true,
  },
});

let db;
let artCollection;
let favoritesCollection;
let usersCollection;
let reportsCollection;

async function ensureIndexes() {
  try {
    if (!artCollection) return;
    // text index for search on title and userName
    await artCollection.createIndex({
      title: "text",
      userName: "text",
      category: 1,
    });
    await artCollection.createIndex({ userEmail: 1 });
    await artCollection.createIndex({ createdAt: -1 });
    await artCollection.createIndex({ featured: 1, visibility: 1 });

    // favorites collection indexes
    if (favoritesCollection) {
      await favoritesCollection.createIndex({ userEmail: 1 });
      await favoritesCollection.createIndex({ artId: 1 });
    }

    // users collection indexes
    if (usersCollection) {
      await usersCollection.createIndex({ email: 1 }, { unique: true });
    }

    // reports collection indexes
    if (reportsCollection) {
      await reportsCollection.createIndex({ artId: 1 });
      await reportsCollection.createIndex({ createdAt: -1 });
    }

    console.log("Indexes ensured");
  } catch (err) {
    console.warn("Could not create indexes:", err);
  }
}

async function connectDB() {
  if (db)
    return {
      artCollection,
      favoritesCollection,
      usersCollection,
      reportsCollection,
    };

  try {
    if (!client.topology || !client.topology.isConnected()) {
      await client.connect();
    }
    const dbName = process.env.DB_NAME || "artify";
    db = client.db(dbName);
    artCollection = db.collection("arts");
    favoritesCollection = db.collection("favorites");
    usersCollection = db.collection("users");
    reportsCollection = db.collection("reports");

    await ensureIndexes();

    console.log("Connected to MongoDB");
    return {
      artCollection,
      favoritesCollection,
      usersCollection,
      reportsCollection,
    };
  } catch (err) {
    console.error("Failed to connect to MongoDB", err);
    throw err;
  }
}

function normalizeVisibility(v) {
  if (!v) return "Public";
  const s = String(v).trim().toLowerCase();
  return s === "private" ? "Private" : "Public";
}

// API: Health Check
app.get("/", (req, res) =>
  res.json({
    ok: true,
    message: "Artify API running",
    endpoints: [
      "/arts",
      "/arts/featured",
      "/likes/total",
      "/users",
      "/admin/stats",
    ],
  })
);

// --- User Management Endpoints ---

// API: Create or Update User
app.post("/users", async (req, res) => {
  try {
    const { usersCollection } = await connectDB();
    const user = req.body;
    const query = { email: user.email };

    // 1. Prepare the update data
    const updateDoc = {
      $set: {
        name: user.name || user.displayName, // Fallback to displayName if 'name' is missing, covering both cases
        photoURL: user.photoURL, // Always update photo
        lastLogin: new Date(), // Keep track of when they last logged in
      },
      $setOnInsert: {
        email: user.email,
        createdAt: new Date(),
        role: "User", // Default role (capitalized for consistency)
      },
    };

    // 2. Perform the Upsert (Update if exists, Insert if new)
    const result = await usersCollection.updateOne(query, updateDoc, {
      upsert: true,
    });

    res.send(result);
  } catch (err) {
    console.error("POST /users error", err);
    res.status(500).send({ error: "Internal server error" });
  }
});

// API: Get All Users (Admin)
app.get("/users", async (req, res) => {
  try {
    const { usersCollection, artCollection } = await connectDB();
    // In a real app, verify admin token here

    const users = await usersCollection.find().toArray();

    // Enhance user data with art stats
    const enhancedUsers = await Promise.all(
      users.map(async (u) => {
        const artCount = await artCollection.countDocuments({
          userEmail: u.email,
        });
        return { ...u, totalArts: artCount };
      })
    );

    return res.json(enhancedUsers);
  } catch (err) {
    console.error("GET /users error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Check Admin Status
app.get("/users/admin/:email", async (req, res) => {
  try {
    const { usersCollection } = await connectDB();
    const email = req.params.email;
    if (!email) return res.status(400).json({ error: "Email required" });

    const user = await usersCollection.findOne({ email: email });
    let isAdmin = false;
    if (user) {
      isAdmin = user.role === "Admin";
    }
    return res.json({ admin: isAdmin });
  } catch (err) {
    console.error("GET /users/admin/:email error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Update User Role
app.patch("/users/:id/role", async (req, res) => {
  try {
    const { usersCollection } = await connectDB();
    const { id } = req.params;
    let { role } = req.body; // "Admin" or "User"

    if (!ObjectId.isValid(id)) {
      console.warn(`PATCH /users/${id}/role: Invalid ID`);
      return res.status(400).json({ error: "Invalid ID" });
    }

    if (role && typeof role === "string") {
      const lower = role.trim().toLowerCase();
      if (lower === "admin") role = "Admin";
      else if (lower === "user") role = "User";
    }

    if (!["Admin", "User"].includes(role)) {
      console.warn(`PATCH /users/${id}/role: Invalid role '${role}'`);
      return res.status(400).json({ error: "Invalid role" });
    }

    const result = await usersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { role: role } }
    );
    return res.json(result);
  } catch (err) {
    console.error("PATCH /users/:id/role error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Delete User
app.delete("/users/:id", async (req, res) => {
  try {
    const { usersCollection } = await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid ID" });

    const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });
    return res.json(result);
  } catch (err) {
    console.error("DELETE /users/:id error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- Admin Dashboard Stats ---

// API: Get Admin Stats
app.get("/admin/stats", async (req, res) => {
  try {
    const { artCollection, usersCollection, reportsCollection } =
      await connectDB();

    const totalUsers = await usersCollection.countDocuments();
    const totalPublicArts = await artCollection.countDocuments({
      visibility: "Public",
    });
    const totalPrivateArts = await artCollection.countDocuments({
      visibility: "Private",
    });

    let totalReportedArts = 0;
    try {
      const distinctReportedArts = await reportsCollection.distinct("artId");
      totalReportedArts = distinctReportedArts.length;
    } catch (e) {
      // Fallback if distinct fails for some reason (though strictly false should fix it)
      totalReportedArts = await reportsCollection.countDocuments();
    }

    // Today's Arts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayArts = await artCollection.countDocuments({
      createdAt: { $gte: today },
    });

    // Most Active Contributors (keeping this as it is useful)
    const topContributors = await artCollection
      .aggregate([
        {
          $group: {
            _id: "$userEmail",
            count: { $sum: 1 },
            name: { $first: "$userName" },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ])
      .toArray();

    // Arts Growth (Daily)
    const artGrowth = await artCollection
      .aggregate([
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } }, // Oldest first
        { $project: { _id: 0, name: "$_id", count: 1 } },
      ])
      .toArray();

    // User Growth (Daily)
    const userGrowth = await usersCollection
      .aggregate([
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, name: "$_id", count: 1 } },
      ])
      .toArray();

    return res.json({
      totalUsers,
      totalPublicArts,
      totalPrivateArts,
      totalReportedArts,
      todayArts,
      topContributors,
      artGrowth,
      userGrowth,
    });
  } catch (err) {
    console.error("GET /admin/stats error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- Report Management ---

// API: Create Report
app.post("/reports", async (req, res) => {
  try {
    const { reportsCollection } = await connectDB();
    const report = req.body;
    // Expect: { artId, artTitle, reporterEmail, reason }
    if (!report.artId || !report.reporterEmail || !report.reason) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const doc = {
      ...report,
      artId: new ObjectId(report.artId), // Ensure stored as ObjectId for lookups
      createdAt: new Date(),
      status: "pending",
    };

    const result = await reportsCollection.insertOne(doc);
    return res.status(201).json(result);
  } catch (err) {
    console.error("POST /reports error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Get All Reports
app.get("/admin/reports", async (req, res) => {
  try {
    const { reportsCollection } = await connectDB();
    const reports = await reportsCollection
      .find()
      .sort({ createdAt: -1 })
      .toArray();
    return res.json(reports);
  } catch (err) {
    console.error("GET /admin/reports error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Resolve/Ignore Report
app.delete("/admin/reports/:id", async (req, res) => {
  try {
    const { reportsCollection } = await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid ID" });

    const result = await reportsCollection.deleteOne({ _id: new ObjectId(id) });
    return res.json(result);
  } catch (err) {
    console.error("DELETE /admin/reports/:id error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- Arts Management (Admin) ---

// API: Get All Arts (Admin View)
app.get("/admin/arts", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const { filter } = req.query; // 'public', 'private', 'reported' implementation depends on join strategies

    // Basic implementation returns all, frontend filters.
    // Ideally we support server side filter.

    const result = await artCollection.find().sort({ createdAt: -1 }).toArray();
    return res.json(result);
  } catch (err) {
    console.error("GET /admin/arts error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// --- Existing Art Routes (Preserved) ---

// API: Create New Art
app.post("/arts", async (req, res) => {
  try {
    const { artCollection, usersCollection } = await connectDB();
    const art = req.body || {};

    // accept several possible body keys for email but prefer userEmail
    const emailFromBody =
      art.userEmail || art.email || art.artistEmail || art.uemail || "";

    if (!emailFromBody) {
      return res
        .status(400)
        .json({ error: "userEmail is required in request body" });
    }

    if (!art.title || !art.image || !art.userName) {
      return res
        .status(400)
        .json({ error: "title, image and userName are required" });
    }

    const price =
      art.price === "" || art.price === null || art.price === undefined
        ? ""
        : Number(art.price);

    const doc = {
      image: art.image,
      title: art.title,
      category: art.category || "Uncategorized",
      medium: art.medium || "",
      description: art.description || "",
      dimensions: art.dimensions || "",
      price: price,
      visibility: normalizeVisibility(art.visibility),
      featured: !!art.featured,
      userName: art.userName,
      userEmail: String(emailFromBody).toLowerCase(),
      artistEmail: art.artistEmail || String(emailFromBody).toLowerCase(),
      artistPhoto: art.artistPhoto || art.artistPhotoUrl || "",
      likes: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await artCollection.insertOne(doc);
    doc._id = result.insertedId;

    // Optional: Update user in usersCollection to ensure they exist/refresh data
    try {
      await usersCollection.updateOne(
        { email: doc.userEmail },
        {
          $set: {
            displayName: doc.userName,
            photoURL: doc.artistPhoto,
          },
          $setOnInsert: { role: "User", createdAt: new Date() },
        },
        { upsert: true }
      );
    } catch (e) {
      // silent fail on user sync
      console.warn("User sync failed on POST /arts", e);
    }

    return res.status(201).json(doc);
  } catch (err) {
    console.error("POST /arts error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Get Featured Arts
app.get("/arts/featured", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const results = await artCollection
      .find({
        visibility: { $regex: /^public$/i },
        featured: true,
      })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray();
    return res.json(results);
  } catch (err) {
    console.error("GET /arts/featured error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Get All Public Arts (with Filtration)
app.get("/arts", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const {
      search,
      category,
      page = 1,
      limit = 12,
      sort,
      artistEmail,
      userEmail,
    } = req.query;
    const query = { visibility: { $regex: /^public$/i } };

    if (category) query.category = category;

    if (artistEmail) {
      query.artistEmail = String(artistEmail).toLowerCase();
    }
    if (userEmail) {
      query.userEmail = String(userEmail).toLowerCase();
    }

    if (search) {
      const regex = new RegExp(search, "i");
      query.$or = [{ title: regex }, { userName: regex }];
    }

    const skip =
      (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
    const lim = Math.max(1, parseInt(limit, 10));
    const sortObj = sort === "recent" ? { createdAt: -1 } : { createdAt: -1 };

    const cursor = artCollection
      .find(query)
      .sort(sortObj)
      .skip(skip)
      .limit(lim);
    const results = await cursor.toArray();
    const total = await artCollection.countDocuments(query);

    return res.json({ total, page: Number(page), limit: lim, data: results });
  } catch (err) {
    console.error("GET /arts error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Get Art Details
app.get("/arts/:id", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid id" });

    const art = await artCollection.findOne({ _id: new ObjectId(id) });
    if (!art) return res.status(404).json({ error: "Artwork not found" });

    const artistCount = await artCollection.countDocuments({
      userEmail: art.userEmail,
    });
    return res.json({
      art,
      artist: {
        userName: art.userName,
        userEmail: art.userEmail,
        artistPhoto: art.artistPhoto || "",
        totalArtworks: artistCount,
      },
    });
  } catch (err) {
    console.error("GET /arts/:id error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Update Art Information
app.patch("/arts/:id", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid id" });

    const update = { ...req.body };
    delete update.likes;
    delete update.createdAt;
    // Allow updating featured status
    if (update.visibility)
      update.visibility = normalizeVisibility(update.visibility);
    update.updatedAt = new Date();

    const result = await artCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: update }
    );
    return res.json(result);
  } catch (err) {
    console.error("PATCH /arts/:id error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Like Art
app.patch("/arts/:id/like", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid id" });
    const _id = new ObjectId(id);

    const upd = await artCollection.updateOne({ _id }, { $inc: { likes: 1 } });
    if (upd.matchedCount === 0)
      return res.status(404).json({ error: "Artwork not found" });

    const updated = await artCollection.findOne(
      { _id },
      { projection: { likes: 1 } }
    );
    return res.json({ likes: updated?.likes || 0 });
  } catch (err) {
    console.error("PATCH /arts/:id/like error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Unlike Art
app.patch("/arts/:id/unlike", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid id" });
    const _id = new ObjectId(id);

    const art = await artCollection.findOne(
      { _id },
      { projection: { likes: 1 } }
    );
    if (!art) return res.status(404).json({ error: "Artwork not found" });
    const current = art.likes || 0;
    if (current <= 0)
      return res.status(400).json({ error: "No likes to remove" });

    await artCollection.updateOne({ _id }, { $inc: { likes: -1 } });
    const updated = await artCollection.findOne(
      { _id },
      { projection: { likes: 1 } }
    );
    return res.json({ likes: updated?.likes || 0 });
  } catch (err) {
    console.error("PATCH /arts/:id/unlike error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Get Total Likes
app.get("/likes/total", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const result = await artCollection
      .aggregate([{ $group: { _id: null, totalLikes: { $sum: "$likes" } } }])
      .toArray();
    return res.json({ totalLikes: result[0]?.totalLikes || 0 });
  } catch (err) {
    console.error("GET /likes/total error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Delete Art
app.delete("/arts/:id", async (req, res) => {
  try {
    const { artCollection, favoritesCollection, reportsCollection } =
      await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid id" });

    const result = await artCollection.deleteOne({ _id: new ObjectId(id) });
    // remove favorites referencing this art (best-effort)
    try {
      await favoritesCollection.deleteMany({ artId: String(id) });
      // Also remove associated reports
      if (reportsCollection) {
        await reportsCollection.deleteMany({ artId: new ObjectId(id) });
      }
    } catch (e) {}
    return res.json(result);
  } catch (err) {
    console.error("DELETE /arts/:id error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Get User's Arts
app.get("/my-arts", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const { email } = req.query;
    if (!email)
      return res.status(400).json({ error: "email query param required" });

    const results = await artCollection
      .find({ userEmail: String(email).toLowerCase() })
      .sort({ createdAt: -1 })
      .toArray();
    return res.json(results);
  } catch (err) {
    console.error("GET /my-arts error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Add Art to Favorites
app.post("/favorites", async (req, res) => {
  try {
    const { favoritesCollection } = await connectDB();
    const { artId, userEmail } = req.body;
    if (!artId || !userEmail)
      return res.status(400).json({ error: "artId and userEmail required" });
    if (!ObjectId.isValid(artId))
      return res.status(400).json({ error: "Invalid artId" });

    const exists = await favoritesCollection.findOne({
      artId: new ObjectId(artId),
      userEmail,
    });
    if (exists) return res.status(409).json({ error: "Already in favorites" });

    const doc = {
      artId: new ObjectId(artId),
      userEmail,
      createdAt: new Date(),
    };
    const result = await favoritesCollection.insertOne(doc);
    return res.status(201).json({ insertedId: result.insertedId });
  } catch (err) {
    console.error("POST /favorites error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Get User Favorites
app.get("/favorites", async (req, res) => {
  try {
    const { artCollection, favoritesCollection } = await connectDB();
    const { email } = req.query;
    if (!email)
      return res.status(400).json({ error: "email query param required" });

    const favs = await favoritesCollection
      .find({ userEmail: email })
      .sort({ createdAt: -1 })
      .toArray();
    const artIds = favs.map((f) => f.artId);
    const arts = await artCollection.find({ _id: { $in: artIds } }).toArray();

    const data = favs.map((f) => {
      const art = arts.find((a) => a._id.toString() === f.artId.toString());
      return { favoriteId: f._id, createdAt: f.createdAt, art: art || null };
    });

    return res.json(data);
  } catch (err) {
    console.error("GET /favorites error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Remove from Favorites
app.delete("/favorites/:id", async (req, res) => {
  try {
    const { favoritesCollection } = await connectDB();
    const { id } = req.params;
    if (!ObjectId.isValid(id))
      return res.status(400).json({ error: "Invalid id" });

    const result = await favoritesCollection.deleteOne({
      _id: new ObjectId(id),
    });
    return res.json(result);
  } catch (err) {
    console.error("DELETE /favorites/:id error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// API: Get Artist Profile
app.get("/artists/:email", async (req, res) => {
  try {
    const { artCollection } = await connectDB();
    const { email } = req.params;
    if (!email) return res.status(400).json({ error: "email required" });

    const totalArtworks = await artCollection.countDocuments({
      userEmail: email,
    });
    const oneArt = await artCollection.findOne({ userEmail: email });
    const profile = {
      userName: oneArt?.userName || "",
      userEmail: email,
      artistPhoto: oneArt?.artistPhoto || "",
      totalArtworks,
    };
    return res.json(profile);
  } catch (err) {
    console.error("GET /artists/:email error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;