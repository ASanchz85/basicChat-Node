import express from "express";
import logger from "morgan";
import { Server } from "socket.io";
import { createServer } from "node:http";
import dotenv from "dotenv";
import { createClient } from "@libsql/client";

const PORT = process.env.PORT ?? 3000,
  URL_DB = "libsql://romantic-ricochet-asanchz85.turso.io";

dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {},
});

const db = createClient({
  url: URL_DB,
  authToken: process.env.DB_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`);

io.on("connection", async (socket) => {
  console.log("a user connected");

  socket.on("disconnect", () => {
    console.log("user disconnected");
  });

  socket.on("chat message", async (message) => {
    let result;
    const userName = socket.handshake.auth.userName ?? "Anonymous";
    try {
      result = await db.execute({
        sql: "INSERT INTO messages (content, user) VALUES (:message, :userName)",
        args: { message, userName },
      });
    } catch (error) {
      console.error(error);
      return;
    }

    io.emit(
      "chat message",
      message,
      result.lastInsertRowid.toString(),
      userName
    );
  });

  if (!socket.recovered) {
    try {
      const results = await db.execute({
        sql: "SELECT id, content, user FROM messages WHERE id > ?",
        args: [socket.handshake.auth.serverOffset ?? 0],
      });

      results.rows.forEach((row) => {
        socket.emit(
          "chat message",
          row.content,
          row.id.toString(),
          row.user
        );
      });
    } catch (error) {
      console.error(error);
    }
  }
});

app.use(logger("dev"));

app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/client/index.html");
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
