
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
  await client.connect();
  console.log("You successfully connected to MongoDB!");
  return client;
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("bondhu-bondhon");
const eventsCollection = db.collection("events");

// Home
app.get("/", (req, res) => {
  res.send("Hello World!");
});

// All events
app.get("/events", async (req, res) => {
  try {
    const events = await eventsCollection.find({}).toArray();
    res.status(200).send(events);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch events" });
  }
});

// Single event
app.get("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event ID" });
    }

    const event = await eventsCollection.findOne({
      _id: new ObjectId(id),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found" });
    }

    res.status(200).send(event);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch event" });
  }
});

// Create event
app.post("/create-events", async (req, res) => {
  try {
    const event = req.body;

    const result = await eventsCollection.insertOne(event);

    res.status(201).send({
      message: "Event created successfully",
      eventId: result.insertedId,
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to create event" });
  }
});

// My events
app.get("/my-events", async (req, res) => {
  try {
    const events = await eventsCollection
      .find({ organizerId: req.query.userId })
      .toArray();

    res.status(200).send(events);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch your events" });
  }
});

// Delete event
app.delete("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event ID" });
    }

    await eventsCollection.deleteOne({ _id: new ObjectId(id) });

    res.status(200).send({ message: "Event deleted" });
  } catch (error) {
    res.status(500).send({ message: "Failed to delete event" });
  }
});

// Update event
app.patch("/events/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event ID" });
    }

    await eventsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: req.body }
    );

    res.status(200).send({ message: "Event updated" });
  } catch (error) {
    res.status(500).send({ message: "Failed to update event" });
  }
});

// Join event
app.post("/events/:id/join", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event ID" });
    }

    if (!userId) {
      return res.status(400).send({ message: "User ID is required" });
    }

    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        participants: { $ne: userId },
        $expr: {
          $lt: [
            { $ifNull: ["$joinedCount", 0] },
            "$capacity",
          ],
        },
      },
      {
        $addToSet: { participants: userId },
        $inc: { joinedCount: 1 },
      }
    );

    if (result.modifiedCount === 0) {
      const event = await eventsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!event) {
        return res.status(404).send({ message: "Event not found" });
      }

      if (event.participants?.includes(userId)) {
        return res.status(400).send({
          message: "You have already joined this event",
        });
      }

      return res.status(400).send({ message: "Event is full" });
    }

    res.status(200).send({ message: "Joined event successfully" });
  } catch (error) {
    res.status(500).send({ message: "Failed to join event" });
  }
});

// Joined events
app.get("/joined-events", async (req, res) => {
  try {
    const events = await eventsCollection
      .find({ participants: req.query.userId })
      .toArray();

    res.status(200).send(events);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch joined events" });
  }
});

// Cancel joined event
app.delete("/events/:id/join", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid event ID" });
    }

    if (!userId) {
      return res.status(400).send({ message: "User ID is required" });
    }

    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        participants: userId,
      },
      {
        $pull: { participants: userId },
        $inc: { joinedCount: -1 },
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).send({
        message: "You have not joined this event",
      });
    }

    res.status(200).send({
      message: "Your spot has been cancelled successfully",
    });
  } catch (error) {
    res.status(500).send({
      message: "Failed to cancel your spot",
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
