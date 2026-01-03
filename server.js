// server.js
const path = require("path");
const express = require("express");
const expressWs = require("express-ws");

const app = express();
expressWs(app);

const PORT = process.env.PORT || 10000;

/* --------------------------------------------------
   ✅ FIX 1: Content Security Policy (CRITICAL)
   Allows WebSocket + fetch from same origin
-------------------------------------------------- */
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' wss://threed-game-1ydu.onrender.com",
    ].join("; ")
  );
  next();
});

/* --------------------------------------------------
   Static files
-------------------------------------------------- */
app.use(express.static(path.join(__dirname, "public")));

/* --------------------------------------------------
   Multiplayer state
-------------------------------------------------- */
const players = new Map();

/* --------------------------------------------------
   Broadcast helper
-------------------------------------------------- */
function broadcast(data) {
  const str = JSON.stringify(data);
  const wss = app.getWss();
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(str);
    }
  });
}

/* --------------------------------------------------
   WebSocket endpoint
-------------------------------------------------- */
app.ws("/ws", (ws) => {
  const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const spawn = { x: 0, y: 0, z: 0 };

  players.set(id, spawn);

  const playersObj = {};
  for (const [pid, pos] of players.entries()) {
    playersObj[pid] = pos;
  }

  ws.send(JSON.stringify({ type: "init", id, players: playersObj }));
  broadcast({ type: "join", id, ...spawn });

  console.log(`🟢 Player connected: ${id}`);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === "move") {
      const x = Number(msg.x) || 0;
      const y = Number(msg.y) || 0;
      const z = Number(msg.z) || 0;

      players.set(id, { x, y, z });
      broadcast({ type: "update", id, x, y, z });
    }
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "leave", id });
    console.log(`🔴 Player disconnected: ${id}`);
  });

  ws.on("error", (err) => {
    console.error("WS error:", err?.message);
  });
});

/* --------------------------------------------------
   Health check
-------------------------------------------------- */
app.get("/healthz", (_, res) => res.json({ ok: true }));

/* --------------------------------------------------
   Start server
-------------------------------------------------- */
app.listen(PORT, () => {
  console.log(`✅ Server listening on PORT ${PORT}`);
  console.log(`🔗 WebSocket: wss://threed-game-1ydu.onrender.com/ws`);
});

