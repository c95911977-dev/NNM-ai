import express from "express";
import { createServer as createViteServer } from "vite";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const JWT_SECRET = process.env.JWT_SECRET || "nnm-secret-key-2026";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Database setup
  const db = await open({
    filename: "./database.sqlite",
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT
    );
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      title TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      role TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(chat_id) REFERENCES chats(id)
    );
  `);

  app.use(express.json());
  app.use(cookieParser());
  app.use(cors({
    origin: true,
    credentials: true
  }));

  // Auth Middleware
  const authenticate = async (req: any, res: any, next: any) => {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      req.user = decoded;
      next();
    } catch (e) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // Auth Routes
  app.post("/api/register", async (req, res) => {
    const { username, password } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await db.run(
        "INSERT INTO users (username, password) VALUES (?, ?)",
        [username, hashedPassword]
      );
      const token = jwt.sign({ id: result.lastID, username }, JWT_SECRET);
      res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'none' });
      res.json({ id: result.lastID, username });
    } catch (e: any) {
      res.status(400).json({ error: "Username already exists" });
    }
  });

  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    const user = await db.get("SELECT * FROM users WHERE username = ?", [username]);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user.id, username }, JWT_SECRET);
    res.cookie("token", token, { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ id: user.id, username });
  });

  app.get("/api/me", authenticate, (req: any, res) => {
    res.json(req.user);
  });

  app.post("/api/logout", (req, res) => {
    res.clearCookie("token", { httpOnly: true, secure: true, sameSite: 'none' });
    res.json({ success: true });
  });

  // Chat Routes
  app.get("/api/chats", authenticate, async (req: any, res) => {
    const chats = await db.all(
      "SELECT * FROM chats WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(chats);
  });

  app.post("/api/chats", authenticate, async (req: any, res) => {
    const { title } = req.body;
    const result = await db.run(
      "INSERT INTO chats (user_id, title) VALUES (?, ?)",
      [req.user.id, title || "New Chat"]
    );
    res.json({ id: result.lastID, title: title || "New Chat" });
  });

  app.get("/api/chats/:id/messages", authenticate, async (req: any, res) => {
    const messages = await db.all(
      "SELECT * FROM messages WHERE chat_id = ? ORDER BY timestamp ASC",
      [req.params.id]
    );
    res.json(messages);
  });

  app.post("/api/chats/:id/messages", authenticate, async (req: any, res) => {
    const { role, content } = req.body;
    await db.run(
      "INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)",
      [req.params.id, role, content]
    );
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
