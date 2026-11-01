import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());
const port = process.env.PORT || 5000;

const client = new MongoClient(process.env.MONGODB_URL);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("bondhu-bondhon");
const eventsCollection = db.collection("events");

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// http://localhost:5000/events

app.get("/events", async (req, res) => {
  try {
    const events = await eventsCollection.find({}).toArray();
    res.status(200).send(events);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch events" });
  }
});

app.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
