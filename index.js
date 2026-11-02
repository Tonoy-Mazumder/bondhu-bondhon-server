import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
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
// all events api
app.get("/events", async (req, res) => {
  try {
    const events = await eventsCollection.find({}).toArray();
    res.status(200).send(events);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch events" });
  }
});

//http://localhost:5000/events/:id
// single event details api
app.get("/events/:id", async (req, res) => {
  const { id } = req.params;
  const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
  if (event) {
    res.status(200).send(event);
  } else {
    res.status(404).send({ message: "Event not found" });
  }
});
// http://localhost:5000/create-events  (POST)
// create event api
app.post("/create-events", async (req, res) => {
const event =  req.body;
  try {
    const result = await eventsCollection.insertOne(event);
    res.status(201).send({ message: "Event created successfully", eventId: result.insertedId });
  } catch (error) {
    res.status(500).send({ message: "Failed to create event" });
  }

})
app.get("/my-events", async (req, res) => {
  const events = await eventsCollection
    .find({ organizerId: req.query.userId })
    .toArray();
  res.send(events);
});

app.delete("/events/:id", async (req, res) => {
  await eventsCollection.deleteOne({ _id: new ObjectId(req.params.id) });
  res.send({ message: "Event deleted" });
});

app.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
