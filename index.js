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
          return res
            .status(400)
            .json({
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

    // List public artworks (Read)
    app.get('/arts', async (req, res) => {
      try {
        const { search, category, page = 1, limit = 12, sort } = req.query;
        const query = { visibility: 'Public' };

        if (category) query.category = category;

        if (search) {
          const regex = new RegExp(search, 'i');
          query.$or = [{ title: regex }, { userName: regex }];
        }

        const options = {
          sort: {},
          skip: (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit)),
          limit: Math.max(1, parseInt(limit)),
        };

        if (sort === 'recent') options.sort = { createdAt: -1 };
        else options.sort = { createdAt: -1 }; // default recent

        const cursor = artCollection.find(query, options);
        const results = await cursor.toArray();
        const total = await artCollection.countDocuments(query);

        res.json({ total, page: Number(page), limit: Number(limit), data: results });
      } catch (err) {
        console.error('GET /arts error', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    //Arts delete:
    app.delete("/arts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await artCollection.deleteOne(query);
      res.send(result);
    });

    // Arts patch:
    app.patch("/arts/:id", async (req, res) => {
      const id = req.params.id;
      const updateArt = req.body;
      const query = { _id: new ObjectId(id) };
      const update = {
        $set: {
          name: updateArt.name,
          price: updateArt.price,
        },
      };

      const result = await artCollection.updateOne(query, update);
      res.send(result);
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
