require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

//Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@mypanel.2nu9rfb.mongodb.net/?appName=MyPanel`;

// // Mongo client
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    //Collection:
    const db = client.db("artify");
    const artCollection = db.collection("arts");
    const favoritesCollection = db.collection("favorites");

    // Add artwork (Create)
    app.post("/arts", async (req, res) => {
      try {
        const art = req.body;

        //Validation
        if (!art.title || !art.image || !art.userEmail || !art.userName) {
          return res.status(400).json({
            error: "title, image, userName and userEmail are required",
          });
        }

        // fields
        const doc = {
          image: art.image,
          title: art.title,
          category: art.category || "Uncategorized",
          medium: art.medium || "",
          description: art.description || "",
          dimensions: art.dimensions || "",
          price: art.price || "",
          visibility: art.visibility || "Public",
          userName: art.userName,
          userEmail: art.userEmail,
          artistPhoto: art.artistPhoto || "",
          likes: 0,
          createdAt: new Date(),
        };

        const result = await artCollection.insertOne(doc);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        console.error("POST /arts error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    app.get("/arts/featured", async (req, res) => {
      console.log("GET /arts/featured called");
      try {
        const results = await artCollection
          .find({ visibility: "Public" })
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();
        console.log("featured count =", results.length);
        res.json(results);
      } catch (err) {
        console.error("GET /arts/featured error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // List public artworks (Read)
    app.get("/arts", async (req, res) => {
      try {
        const { search, category, page = 1, limit = 12, sort } = req.query;
        const query = { visibility: "Public" };

        if (category) query.category = category;

        if (search) {
          const regex = new RegExp(search, "i");
          query.$or = [{ title: regex }, { userName: regex }];
        }

        const options = {
          sort: {},
          skip:
            (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit)),
          limit: Math.max(1, parseInt(limit)),
        };

        if (sort === "recent") options.sort = { createdAt: -1 };
        else options.sort = { createdAt: -1 };

        const cursor = artCollection.find(query, options);
        const results = await cursor.toArray();
        const total = await artCollection.countDocuments(query);

        res.json({
          total,
          page: Number(page),
          limit: Number(limit),
          data: results,
        });
      } catch (err) {
        console.error("GET /arts error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Get single artwork details (Read)
    app.get("/arts/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: "Invalid id" });

        const art = await artCollection.findOne({ _id: new ObjectId(id) });
        if (!art) return res.status(404).json({ error: "Artwork not found" });

        // artist summary
        const artistCount = await artCollection.countDocuments({
          userEmail: art.userEmail,
          visibility: { $in: ["Public", "Private"] },
        });

        res.json({
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
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Update artwork (partial update)
    app.patch("/arts/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const update = req.body;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: "Invalid id" });

        delete update.likes;
        delete update.createdAt;

        const result = await artCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: update }
        );
        res.json(result);
      } catch (err) {
        console.error("PATCH /arts/:id error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // Increment like count (robust)
    app.patch("/arts/:id/like", async (req, res) => {
      const { id } = req.params;
      try {
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: "Invalid id" });

        const _id = new ObjectId(id);

        // Atomic increment
        const upd = await artCollection.updateOne(
          { _id },
          { $inc: { likes: 1 } }
        );
        if (upd.matchedCount === 0) {
          return res.status(404).json({ error: "Artwork not found" });
        }

        // Fetch updated doc to return likes
        const updated = await artCollection.findOne(
          { _id },
          { projection: { likes: 1 } }
        );
        if (!updated)
          return res
            .status(500)
            .json({ error: "Failed to fetch updated artwork" });

        return res.json({ likes: updated.likes || 0 });
      } catch (err) {
        console.error("PATCH /arts/:id/like error", err);
        return res
          .status(500)
          .json({ error: "Internal server error", details: err.message });
      }
    });

    // Decrement like count (robust)
    app.patch("/arts/:id/unlike", async (req, res) => {
      const { id } = req.params;
      try {
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: "Invalid id" });

        const _id = new ObjectId(id);

        // Read current likes first
        const art = await artCollection.findOne(
          { _id },
          { projection: { likes: 1 } }
        );
        if (!art) return res.status(404).json({ error: "Artwork not found" });

        const current = art.likes || 0;
        if (current <= 0)
          return res.status(400).json({ error: "No likes to remove" });

        // Decrement
        const upd = await artCollection.updateOne(
          { _id },
          { $inc: { likes: -1 } }
        );
        if (upd.matchedCount === 0)
          return res.status(404).json({ error: "Artwork not found" });

        const updated = await artCollection.findOne(
          { _id },
          { projection: { likes: 1 } }
        );
        if (!updated)
          return res
            .status(500)
            .json({ error: "Failed to fetch updated artwork" });

        return res.json({ likes: updated.likes || 0 });
      } catch (err) {
        console.error("PATCH /arts/:id/unlike error", err);
        return res
          .status(500)
          .json({ error: "Internal server error", details: err.message });
      }
    });

    // -----------------------
    // Get total likes of all artworks
    // -----------------------
    app.get("/likes/total", async (req, res) => {
      try {
        const result = await artCollection
          .aggregate([
            { $group: { _id: null, totalLikes: { $sum: "$likes" } } },
          ])
          .toArray();

        const totalLikes = result[0]?.totalLikes || 0;
        res.json({ totalLikes });
      } catch (err) {
        console.error("GET /likes/total error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // -----------------------
    // Delete artwork
    // -----------------------
    app.delete("/arts/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: "Invalid id" });

        const result = await artCollection.deleteOne({ _id: new ObjectId(id) });
        res.json(result);
      } catch (err) {
        console.error("DELETE /arts/:id error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // -----------------------
    // Get artworks by logged-in user (My Gallery)
    // -----------------------
    app.get("/my-arts", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email)
          return res.status(400).json({ error: "email query param required" });

        const results = await artCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();
        res.json(results);
      } catch (err) {
        console.error("GET /my-arts error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // -----------------------
    // Favorites: add, list, remove
    // -----------------------
    // POST /favorites  body: { artId, userEmail }
    app.post("/favorites", async (req, res) => {
      try {
        const { artId, userEmail } = req.body;
        if (!artId || !userEmail)
          return res
            .status(400)
            .json({ error: "artId and userEmail required" });
        if (!ObjectId.isValid(artId))
          return res.status(400).json({ error: "Invalid artId" });

        // prevent duplicates
        const exists = await favoritesCollection.findOne({
          artId: new ObjectId(artId),
          userEmail,
        });
        if (exists)
          return res.status(409).json({ error: "Already in favorites" });

        const doc = {
          artId: new ObjectId(artId),
          userEmail,
          createdAt: new Date(),
        };
        const result = await favoritesCollection.insertOne(doc);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (err) {
        console.error("POST /favorites error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // GET /favorites?email=user@example.com
    app.get("/favorites", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email)
          return res.status(400).json({ error: "email query param required" });

        const favs = await favoritesCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();
        const artIds = favs.map((f) => f.artId);
        const arts = await artCollection
          .find({ _id: { $in: artIds } })
          .toArray();

        const data = favs.map((f) => {
          const art = arts.find((a) => a._id.toString() === f.artId.toString());
          return {
            favoriteId: f._id,
            createdAt: f.createdAt,
            art: art || null,
          };
        });

        res.json(data);
      } catch (err) {
        console.error("GET /favorites error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // DELETE /favorites/:id
    app.delete("/favorites/:id", async (req, res) => {
      try {
        const { id } = req.params;
        if (!ObjectId.isValid(id))
          return res.status(400).json({ error: "Invalid id" });

        const result = await favoritesCollection.deleteOne({
          _id: new ObjectId(id),
        });
        res.json(result);
      } catch (err) {
        console.error("DELETE /favorites/:id error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    // -----------------------
    // GET /artists/:email
    // -----------------------
    app.get("/artists/:email", async (req, res) => {
      try {
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
        res.json(profile);
      } catch (err) {
        console.error("GET /artists/:email error", err);
        res.status(500).json({ error: "Internal server error" });
      }
    });

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Smart server is running on port: ${port}`);
});
module.exports = app;