import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import axios from "axios";

const ELEVEN_API_KEY = process.env.ELEVEN_API_KEY;
const AGENT_ID = process.env.AGENT_ID;
const PORT = 3001;

const server = http.createServer();
const wss = new WebSocketServer({ server, path: "/ws/twilio" });

let elevenWs = null;
let streamSid = null;
let twilioWs = null;

// -------- ELEVENLABS SETUP --------
async function connectElevenLabs() {
  const { data } = await axios.get(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`,
    { headers: { "xi-api-key": ELEVEN_API_KEY } }
  );

  elevenWs = new WebSocket(data.signed_url);

  elevenWs.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.type === "audio" && streamSid) {
      twilioWs.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: msg.audio.chunk }
      }));
    }

    if (msg.type === "interruption") {
      twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
    }

    if (msg.type === "ping") {
      elevenWs.send(JSON.stringify({
        type: "pong",
        event_id: msg.ping_event.event_id
      }));
    }
  });
}

// -------- TWILIO WS --------
wss.on("connection", async (ws) => {
  console.log("📞 Twilio connected");
  twilioWs = ws;

  await connectElevenLabs();

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      console.log("▶ Stream started:", streamSid);
    }

    if (msg.event === "media") {
      elevenWs.send(JSON.stringify({
        user_audio_chunk: msg.media.payload
      }));
    }

    if (msg.event === "stop") {
      elevenWs.close();
      streamSid = null;
    }
  });

  ws.on("close", () => {
    elevenWs?.close();
    streamSid = null;
  });
});

server.listen(PORT, () =>
  console.log(`🚀 Agent running on ${PORT}`)
);
