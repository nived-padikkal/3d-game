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

/**
 * ============================
 * HTTP SERVER (IMPORTANT)
 * ============================
 * This is REQUIRED so cloud providers
 * see an open HTTP port.
 */
const server = http.createServer((req, res) => {
  if (req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Twilio ElevenLabs WS is running");
  }
});

/**
 * ============================
 * WEBSOCKET SERVER
 * ============================
 */
const wss = new WebSocketServer({
  server,
  path: "/ws/twilio",
});

let elevenWs = null;
let streamSid = null;
let twilioWs = null;

/**
 * ============================
 * CONNECT TO ELEVENLABS
 * ============================
 */
async function connectElevenLabs() {
  const { data } = await axios.get(
    `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`,
    {
      headers: {
        "xi-api-key": ELEVEN_API_KEY,
      },
    }
  );

  elevenWs = new WebSocket(data.signed_url);

  elevenWs.on("open", () => {
    console.log("🟢 ElevenLabs connected");
  });

  elevenWs.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    // 🔊 ElevenLabs → Twilio
    if (msg.type === "audio" && streamSid && twilioWs) {
      twilioWs.send(JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: msg.audio.chunk },
      }));
    }

    // 🛑 Barge-in support
    if (msg.type === "interruption" && twilioWs) {
      twilioWs.send(JSON.stringify({
        event: "clear",
        streamSid,
      }));
    }

    // ❤️ Keepalive
    if (msg.type === "ping") {
      elevenWs.send(JSON.stringify({
        type: "pong",
        event_id: msg.ping_event?.event_id,
      }));
    }
  });

  elevenWs.on("close", () => {
    console.log("🔴 ElevenLabs disconnected");
  });

  elevenWs.on("error", (err) => {
    console.error("ElevenLabs WS error:", err);
  });
}

/**
 * ============================
 * TWILIO MEDIA STREAMS
 * ============================
 */
wss.on("connection", async (ws) => {
  console.log("📞 Twilio connected");
  twilioWs = ws;

  await connectElevenLabs();

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    // ▶ Start
    if (msg.event === "start") {
      streamSid = msg.start.streamSid;
      console.log("▶ Stream started:", streamSid);
    }

    // 🎤 User → ElevenLabs
    if (msg.event === "media" && elevenWs?.readyState === WebSocket.OPEN) {
      elevenWs.send(JSON.stringify({
        user_audio_chunk: msg.media.payload,
      }));
    }

    // ⏹ Stop
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

  ws.on("error", (err) => {
    console.error("Twilio WS error:", err);
  });
});

/**
 * ============================
 * START SERVER
 * ============================
 */
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
