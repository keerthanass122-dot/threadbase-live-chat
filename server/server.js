import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { createServer } from "http";
import { Server } from "socket.io";
import { randomUUID } from "crypto";
import { verifyToken } from "./middleware/auth.js";

const app = express();

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

const USERS = [
  { userId: 1, name: "Ada", email: "ada@threadbase.dev", password: "password" },
  { userId: 2, name: "Linus", email: "linus@threadbase.dev", password: "password" },
];

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body ?? {};
  const found = USERS.find(
    (u) => u.email === email && u.password === password
  );

  if (!found) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = jwt.sign(
    { userId: found.userId, name: found.name },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

  res.json({
    accessToken,
    user: { userId: found.userId, name: found.name },
  });
});

app.get("/api/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error("No token provided"));
  }

  try {
    socket.data.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});

io.on("connection", (socket) => {
  console.log(`${socket.data.user.name} connected`);

  socket.on("room:join", (roomId) => {
    if (typeof roomId !== "string" || !roomId.trim()) return;
    socket.join(roomId);
    console.log(`${socket.data.user.name} joined ${roomId}`);
  });

  socket.on("chat:message", ({ roomId, text } = {}) => {
    if (
      typeof roomId !== "string" ||
      !roomId.trim() ||
      typeof text !== "string" ||
      !text.trim()
    ) return;

    if (!socket.rooms.has(roomId)) return;

    const message = {
      id: randomUUID(),
      text: text.trim(),
      user: socket.data.user.name,
      timestamp: Date.now(),
    };

    io.to(roomId).emit("chat:message", message);
  });

  socket.on("disconnect", () => {
    console.log(`${socket.data.user.name} disconnected`);
  });
});

const PORT = process.env.PORT ?? 3001;

httpServer.listen(PORT, () => {
  console.log(`Server on http://localhost:${PORT}`);
  console.log("POST /auth/login");
  console.log("Socket.io chat is ready");
});
