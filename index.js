// index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const MONGODB_URI =
  process.env.MONGODB_URI ||
  (process.env.DB_USER && process.env.DB_PASS
    ? `mongodb+srv://${encodeURIComponent(process.env.DB_USER)}:${encodeURIComponent(process.env.DB_PASS)}@mypanel.2nu9rfb.mongodb.net/?appName=MyPanel`
    : "mongodb://127.0.0.1:27017");

const client = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let artCollection;
let favoritesCollection;

function normalizeVisibility(v) {
  if (!v) return "Public";
  const s = String(v).trim().toLowerCase();
  return s === "private" ? "Private" : "Public";
}

async function ensureIndexes() {
  try {
    if (!artCollection) return;
    // text index for search on title and userName
    await artCollection.createIndex({ title: "text", userName: "text", category: 1 });
    // quick lookup by userEmail
    await artCollection.createIndex({ userEmail: 1 });
    // createdAt for sorting
    await artCollection.createIndex({ createdAt: -1 });
    // featured & visibility for featured queries
    await artCollection.createIndex({ featured: 1, visibility: 1 });
    // favorites collection indexes
    if (favoritesCollection) {
      await favoritesCollection.createIndex({ userEmail: 1 });
      await favoritesCollection.createIndex({ artId: 1 });
    }
    console.log("Indexes ensured");
  } catch (err) {
    console.warn("Could not create indexes:", err);
  }
}

async function run() {
  try {
    await client.connect();
    const dbName = process.env.DB_NAME || "artify";
    const db = client.db(dbName);
    artCollection = db.collection("arts");
    favoritesCollection = db.collection("favorites");

    await ensureIndexes();

    app.get("/", (req, res) =>
      res.json({
        ok: true,
        message: "Artify API running",
        endpoints: ["/arts", "/arts/featured", "/likes/total"],
      })
    );

    app.post("/arts", async (req, res) => {
      try {
        const art = req.body || {};

        // accept several possible body keys for email but prefer userEmail
        const emailFromBody =
          art.userEmail ||
          art.email ||
          art.artistEmail ||
          art.uemail ||
          "";

        if (!emailFromBody) {
          return res.status(400).json({ error: "userEmail is required in request body" });
        }

        if (!art.title || !art.image || !art.userName) {
          return res.status(400).json({ error: "title, image and userName are required" });
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
        return res.status(201).json(doc);
      } catch (err) {
        console.error("POST /arts error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get("/arts/featured", async (req, res) => {
      try {
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

    app.get("/arts", async (req, res) => {
      try {
        const { search, category, page = 1, limit = 12, sort, artistEmail, userEmail } = req.query;
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

        const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.max(1, parseInt(limit, 10));
        const lim = Math.max(1, parseInt(limit, 10));
        const sortObj = sort === "recent" ? { createdAt: -1 } : { createdAt: -1 };

        const cursor = artCollection.find(query).sort(sortObj).skip(skip).limit(lim);
        const results = await cursor.toArray();
        const total = await artCollection.countDocuments(query);

        return res.json({ total, page: Number(page), limit: lim, data: results });
      } catch (err) {
        console.error("GET /arts error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get("/arts/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

        const art = await artCollection.findOne({ _id: new ObjectId(id) });
        if (!art) return res.status(404).json({ error: "Artwork not found" });

        const artistCount = await artCollection.countDocuments({ userEmail: art.userEmail });
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

    app.patch("/arts/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

        const update = { ...req.body };
        delete update.likes;
        delete update.createdAt;
        if (update.visibility) update.visibility = normalizeVisibility(update.visibility);
        update.updatedAt = new Date();

        const result = await artCollection.updateOne({ _id: new ObjectId(id) }, { $set: update });
        return res.json(result);
      } catch (err) {
        console.error("PATCH /arts/:id error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.patch("/arts/:id/like", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });
        const _id = new ObjectId(id);

        const upd = await artCollection.updateOne({ _id }, { $inc: { likes: 1 } });
        if (upd.matchedCount === 0) return res.status(404).json({ error: "Artwork not found" });

        const updated = await artCollection.findOne({ _id }, { projection: { likes: 1 } });
        return res.json({ likes: updated?.likes || 0 });
      } catch (err) {
        console.error("PATCH /arts/:id/like error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.patch("/arts/:id/unlike", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });
        const _id = new ObjectId(id);

        const art = await artCollection.findOne({ _id }, { projection: { likes: 1 } });
        if (!art) return res.status(404).json({ error: "Artwork not found" });
        const current = art.likes || 0;
        if (current <= 0) return res.status(400).json({ error: "No likes to remove" });

        await artCollection.updateOne({ _id }, { $inc: { likes: -1 } });
        const updated = await artCollection.findOne({ _id }, { projection: { likes: 1 } });
        return res.json({ likes: updated?.likes || 0 });
      } catch (err) {
        console.error("PATCH /arts/:id/unlike error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get("/likes/total", async (req, res) => {
      try {
        const result = await artCollection.aggregate([{ $group: { _id: null, totalLikes: { $sum: "$likes" } } }]).toArray();
        return res.json({ totalLikes: result[0]?.totalLikes || 0 });
      } catch (err) {
        console.error("GET /likes/total error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.delete("/arts/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

        const result = await artCollection.deleteOne({ _id: new ObjectId(id) });
        // remove favorites referencing this art (best-effort)
        try { await favoritesCollection.deleteMany({ artId: String(id) }); } catch (e) {}
        return res.json(result);
      } catch (err) {
        console.error("DELETE /arts/:id error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get("/my-arts", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: "email query param required" });

        const results = await artCollection.find({ userEmail: String(email).toLowerCase() }).sort({ createdAt: -1 }).toArray();
        return res.json(results);
      } catch (err) {
        console.error("GET /my-arts error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.post("/favorites", async (req, res) => {
      try {
        const { artId, userEmail } = req.body;
        if (!artId || !userEmail) return res.status(400).json({ error: "artId and userEmail required" });
        if (!ObjectId.isValid(artId)) return res.status(400).json({ error: "Invalid artId" });

        const exists = await favoritesCollection.findOne({ artId: new ObjectId(artId), userEmail });
        if (exists) return res.status(409).json({ error: "Already in favorites" });

        const doc = { artId: new ObjectId(artId), userEmail, createdAt: new Date() };
        const result = await favoritesCollection.insertOne(doc);
        return res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        console.error("POST /favorites error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get("/favorites", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) return res.status(400).json({ error: "email query param required" });

        const favs = await favoritesCollection.find({ userEmail: email }).sort({ createdAt: -1 }).toArray();
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

    app.delete("/favorites/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid id" });

        const result = await favoritesCollection.deleteOne({ _id: new ObjectId(id) });
        return res.json(result);
      } catch (err) {
        console.error("DELETE /favorites/:id error", err);
        return res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get("/artists/:email", async (req, res) => {
      try {
        const { email } = req.params;
        if (!email) return res.status(400).json({ error: "email required" });

        const totalArtworks = await artCollection.countDocuments({ userEmail: email });
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

    await client.db("admin").command({ ping: 1 });
    console.log("Connected to MongoDB and server routes set up.");
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

run();

// graceful shutdown
process.on("SIGINT", async () => {
  console.log("SIGINT received — shutting down gracefully");
  try {
    await client.close();
    console.log("Mongo client closed");
  } catch (e) {
    console.warn("Error closing Mongo client", e);
  }
  process.exit(0);
});
process.on("SIGTERM", async () => {
  console.log("SIGTERM received — shutting down gracefully");
  try {
    await client.close();
    console.log("Mongo client closed");
  } catch (e) {
    console.warn("Error closing Mongo client", e);
  }
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;