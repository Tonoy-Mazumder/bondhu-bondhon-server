import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import { jwtVerify, createRemoteJWKSet } from "jose";
const app = express();
app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  }),
);
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

const AUTH_BASE_URL = process.env.FRONTEND_URL || "http://localhost:3000";

const JWKS = createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/api/auth/jwks`));

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Unauthorized: Token missing",
      });
    }

    const token = authHeader.split(" ")[1];

    const { payload } = await jwtVerify(token, JWKS, {
      issuer: AUTH_BASE_URL,
      audience: AUTH_BASE_URL,
    });

    if (!payload.sub) {
      return res.status(401).send({
        message: "Invalid token",
      });
    }

    req.user = {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      image: payload.image,
    };

    next();
  } catch (error) {
    console.error("JWT verification failed:", error);

    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
}

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

app.post("/create-events", requireAuth, async (req, res) => {
  try {
    const { title, description, category, image, location, date, capacity } =
      req.body;

    // Basic validation
    if (
      !title ||
      !description ||
      !category ||
      !location ||
      !date ||
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 10000
    ) {
      return res.status(400).send({
        message: "Please provide valid event information",
      });
    }

    // Date format validation
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).send({
        message: "Invalid event date format",
      });
    }

    // Check actual calendar date
    const parsedDate = new Date(`${date}T00:00:00.000Z`);

    if (
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      return res.status(400).send({
        message: "Invalid event date",
      });
    }

    // Get today's date in Bangladesh timezone
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    // Only future dates allowed
    if (date <= today) {
      return res.status(400).send({
        message: "Event date must be in the future",
      });
    }

    // Create event
    const event = {
      title,
      description,
      category,
      image: image || "",
      location,
      date,
      capacity,
      joinedCount: 0,
      participants: [],

      organizerId: req.user.id,
      organizerName: req.user.name,
      organizerImage: req.user.image || "",

      createdAt: new Date().toISOString(),
    };
    const result = await eventsCollection.insertOne(event);

    res.status(201).send({
      message: "Event created successfully",
      eventId: result.insertedId,
    });
  } catch (error) {
    console.error("Create event error:", error);

    res.status(500).send({
      message: "Failed to create event",
    });
  }
});

// My events
app.get("/my-events", requireAuth, async (req, res) => {
  try {
    const events = await eventsCollection
      .find({ organizerId: req.user.id })
      .toArray();

    res.status(200).send(events);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch your events",
    });
  }
});

// Delete event
app.delete("/events/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    const result = await eventsCollection.deleteOne({
      _id: new ObjectId(id),
      organizerId: req.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Event not found or you are not the owner",
      });
    }

    res.status(200).send({
      message: "Event deleted successfully",
    });
  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to delete event",
    });
  }
});
// Update event

app.patch("/events/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    const allowedFields = [
      "title",
      "description",
      "category",
      "image",
      "location",
      "date",
      "capacity",
    ];

    const updateData = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).send({
        message: "No valid fields provided",
      });
    }

    // Validate date if provided
    if (updateData.date !== undefined) {
      const date = updateData.date;

      if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).send({
          message: "Invalid event date format",
        });
      }

      const parsedDate = new Date(`${date}T00:00:00.000Z`);

      if (
        Number.isNaN(parsedDate.getTime()) ||
        parsedDate.toISOString().slice(0, 10) !== date
      ) {
        return res.status(400).send({
          message: "Invalid event date",
        });
      }

      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Dhaka",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

      if (date <= today) {
        return res.status(400).send({
          message: "Event date must be in the future",
        });
      }
    }

    // Validate capacity if provided
    if (updateData.capacity !== undefined) {
      const capacity = Number(updateData.capacity);

      if (!Number.isInteger(capacity) || capacity < 1 || capacity > 10000) {
        return res.status(400).send({
          message: "Invalid participant capacity",
        });
      }

      updateData.capacity = capacity;
    }

    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        organizerId: req.user.id,
        ...(updateData.capacity !== undefined
          ? { joinedCount: { $lte: updateData.capacity } }
          : {}),
      },
      {
        $set: updateData,
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Event not found, unauthorized, or capacity is too low",
      });
    }

    res.status(200).send({
      message: "Event updated successfully",
    });
  } catch (error) {
    console.error("Update event error:", error);

    res.status(500).send({
      message: "Failed to update event",
    });
  }
});

// Join event

app.post("/events/:id/join", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        participants: { $ne: userId },
        date: { $gt: today },
        $expr: {
          $lt: [{ $ifNull: ["$joinedCount", 0] }, "$capacity"],
        },
      },
      {
        $addToSet: { participants: userId },
        $inc: { joinedCount: 1 },
      },
    );

    if (result.modifiedCount === 0) {
      const event = await eventsCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!event) {
        return res.status(404).send({
          message: "Event not found",
        });
      }

      if (event.date <= today) {
        return res.status(400).send({
          message: "This event is no longer available",
        });
      }

      if (event.participants?.includes(userId)) {
        return res.status(400).send({
          message: "You have already joined this event",
        });
      }

      return res.status(400).send({
        message: "Event is full",
      });
    }

    res.status(200).send({
      message: "Joined event successfully",
    });
  } catch (error) {
    console.error("Join event error:", error);

    res.status(500).send({
      message: "Failed to join event",
    });
  }
});

// Joined events

app.get("/joined-events", requireAuth, async (req, res) => {
  try {
    const events = await eventsCollection
      .find({ participants: req.user.id })
      .toArray();

    res.status(200).send(events);
  } catch (error) {
    console.error("Joined events error:", error);

    res.status(500).send({
      message: "Failed to fetch joined events",
    });
  }
});

// Cancel joined event

app.delete("/events/:id/join", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid event ID",
      });
    }

    const result = await eventsCollection.updateOne(
      {
        _id: new ObjectId(id),
        participants: userId,
      },
      {
        $pull: { participants: userId },
        $inc: { joinedCount: -1 },
      },
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
    console.error("Cancel join error:", error);

    res.status(500).send({
      message: "Failed to cancel your spot",
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
