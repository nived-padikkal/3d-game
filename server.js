import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import axios from "axios";

/**
 * ============================
 * CONFIG (USE ENV IN PROD)
 * ============================
 */
const ELEVEN_API_KEY = "sk_5618a4876bab0f8ad49eeb0ca6824fac89df680ccaa15719"; // REQUIRED
const AGENT_ID = "agent_8801kdz2hmg6e94vq3t08vnxn5c2";             // REQUIRED
const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("OK");
});

const wss = new WebSocketServer({
  server,
  path: "/ws/twilio",
});

let twilioWs = null;
let elevenWs = null;
let streamSid = null;
let elevenReady = false;

// ---------------- ELEVENLABS ----------------
async function connectElevenLabs() {
  const { data } = await axios.get(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`,
    { headers: { "xi-api-key": ELEVEN_API_KEY } }
  );

  elevenWs = new WebSocket(data.signed_url);

  elevenWs.on("open", () => {
    console.log("🟢 ElevenLabs connected");

    // ✅ REQUIRED: start conversation
    elevenWs.send(JSON.stringify({
      type: "conversation_start"
    }));

    elevenReady = true;
  });

  elevenWs.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    // 🔊 AI → User
    if (msg.type === "audio" && streamSid && twilioWs) {
      twilioWs.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: msg.audio.chunk }
      }));
    }

    // 🛑 Barge-in
    if (msg.type === "interruption" && twilioWs) {
      twilioWs.send(JSON.stringify({ event: "clear", streamSid }));
    }

    // ❤️ Keepalive
    if (msg.type === "ping" && msg.ping_event?.event_id) {
      elevenWs.send(JSON.stringify({
        type: "pong",
        event_id: msg.ping_event.event_id
      }));
    }
  });

  elevenWs.on("close", () => {
    console.log("🔴 ElevenLabs disconnected");
    elevenReady = false;
  });

  elevenWs.on("error", (err) => {
    console.error("ElevenLabs error:", err);
  });
}

// ---------------- TWILIO ----------------
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

    // 🎤 User → AI (ONLY if ElevenLabs ready)
    if (msg.event === "media" && elevenReady && elevenWs?.readyState === WebSocket.OPEN) {
      elevenWs.send(JSON.stringify({
        user_audio_chunk: msg.media.payload
      }));
    }

    if (msg.event === "stop") {
      streamSid = null;
      elevenWs?.close();
    }
  });

  ws.on("close", () => {
    console.log("❌ Twilio disconnected");
    streamSid = null;
    elevenWs?.close();
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server listening on ${PORT}`);
});
