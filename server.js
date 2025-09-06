// Install: npm install ws
const WebSocket = require("ws");
const server = new WebSocket.Server({ port: 3000 });

let players = {}; // {id: {x, y, z}}

server.on("connection", (socket) => {
  const id = Date.now();
  players[id] = { x: 0, y: 0, z: 0 };

  socket.send(JSON.stringify({ type: "init", id, players }));
  broadcast({ type: "join", id, ...players[id] });

  socket.on("message", (msg) => {
    const data = JSON.parse(msg);

    if (data.type === "move") {
      players[id] = { x: data.x, y: data.y, z: data.z };
      broadcast({ type: "update", id, ...players[id] });
    }
  });

  socket.on("close", () => {
    delete players[id];
    broadcast({ type: "leave", id });
  });
});

function broadcast(message) {
  const data = JSON.stringify(message);
  server.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

console.log("3D Game server running on ws://localhost:3000");
