const path = require("path");
const express = require("express");
const expressWs = require("express-ws");

const app = express();
expressWs(app);

const PORT = process.env.PORT || 10000;

/* CSP */
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      "connect-src 'self' wss:",
    ].join("; ")
  );
  next();
});

/* Static */
app.use(express.static(path.join(__dirname, "public")));

/* State */
const players = new Map();

/* Broadcast */
function broadcast(data) {
  const str = JSON.stringify(data);
  const wss = app.getWss();
  wss.clients.forEach((client) => {
    if (client.readyState === 1) client.send(str);
  });
}

/* WebSocket */
app.ws("/ws", (ws) => {
  const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const spawn = { x: 0, y: 0, z: 0 };

  players.set(id, spawn);

  const snapshot = {};
  for (const [pid, pos] of players.entries()) snapshot[pid] = pos;

  ws.send(JSON.stringify({ type: "init", id, players: snapshot }));
  broadcast({ type: "join", id, ...spawn });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === "move") {
        const x = Number(msg.x) || 0;
        const y = Number(msg.y) || 0;
        const z = Number(msg.z) || 0;
        players.set(id, { x, y, z });
        broadcast({ type: "update", id, x, y, z });
      }
    } catch {}
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "leave", id });
  });
});

/* Health */
app.get("/healthz", (_, res) => res.json({ ok: true }));

/* Start */
app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`);
  console.log(`🔗 WSS: wss://threed-game-1ydu.onrender.com/ws`);
});
