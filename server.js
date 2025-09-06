// server.js
// Minimal multiplayer server using express + express-ws
// - Serves static files from ./public
// - WS endpoint: /ws
// Messages (JSON):
// { type: "init" } -> server responds with { type: "init", id, players }
// { type: "move", x, y, z } -> server updates and broadcasts { type: "update", id, x, y, z }

const path = require("path");
const express = require("express");
const expressWs = require("express-ws");

const app = express();
expressWs(app); // attach express-ws to the express app

const PORT = process.env.PORT || 3000;

// Serve static client files from "public" directory (put your index.html + client JS there)
app.use(express.static(path.join(__dirname, "public")));

// In-memory players store: id -> { x, y, z }
const players = new Map();

// Helper: broadcast message to all connected sockets
function broadcast(data) {
  const str = JSON.stringify(data);
  // express-ws keeps track of ws clients on app.wsInstance? We'll iterate active clients from all ws routes
  // Use express-ws's getWss() to get the underlying WebSocketServer
  const wss = app.getWss ? app.getWss() : null;
  if (!wss) return;
  wss.clients.forEach((client) => {
    if (client.readyState === client.OPEN) client.send(str);
  });
}

// WebSocket endpoint
app.ws("/ws", (ws, req) => {
  // create a simple unique id (timestamp + random)
  const id = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;

  // initial spawn position
  const spawn = { x: 0, y: 0, z: 0 };
  players.set(id, spawn);

  // send init: your id and current players
  const playersObj = {};
  for (const [pid, pos] of players.entries()) playersObj[pid] = pos;
  ws.send(JSON.stringify({ type: "init", id, players: playersObj }));

  // broadcast that a new player joined
  broadcast({ type: "join", id, ...spawn });

  console.log(`Player connected: ${id} (total: ${players.size})`);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      console.warn("Invalid JSON from client, ignoring.");
      return;
    }

    if (msg.type === "move") {
      // Validate numeric positions (basic)
      const x = Number(msg.x) || 0;
      const y = Number(msg.y) || 0;
      const z = Number(msg.z) || 0;
      players.set(id, { x, y, z });

      // Broadcast update to all clients
      broadcast({ type: "update", id, x, y, z });
    } else {
      // Unknown message types can be ignored or extended
    }
  });

  ws.on("close", () => {
    players.delete(id);
    broadcast({ type: "leave", id });
    console.log(`Player disconnected: ${id} (total: ${players.size})`);
  });

  ws.on("error", (err) => {
    console.error("WebSocket error for", id, err && err.message);
  });
});

// simple health endpoint
app.get("/healthz", (req, res) => res.send({ ok: true }));

// Start server
app.listen(PORT, () => {
  console.log(`Express WebSocket server listening on port ${PORT}`);
  console.log(`WebSocket endpoint: ws://<host>:${PORT}/ws`);
});
