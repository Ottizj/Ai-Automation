import axios from "axios";
import "dotenv/config";
import express, { type Request, type Response } from "express";

type ChatMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT =
  "You are Ottiz a friendly AI assistant. If asked your name, say you are Ottiz. Keep answers helpful and concise.";
const MAX_HISTORY = 20; // most recent messages to keep

function isChatMessage(m: unknown): m is ChatMessage {
  if (typeof m !== "object" || m === null) return false;
  const { role, content } = m as Record<string, unknown>;
  return (
    (role === "user" || role === "assistant") && typeof content === "string"
  );
}

function buildPrompt(history: ChatMessage[], message: string): string {
  const turns = [...history.slice(-MAX_HISTORY), { role: "user", content: message }]
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");
  return `${SYSTEM_PROMPT}\n\n${turns}\nAssistant:`;
}
function parseChatBody(
  body: unknown,
): { message: string; history: ChatMessage[] } | null {
  const { message, history = [] } = (body ?? {}) as Record<string, unknown>;
  if (typeof message !== "string" || !message.trim()) return null;
  if (!Array.isArray(history) || !history.every(isChatMessage)) return null;
  return { message, history };
}


const app = express();
app.use(express.json());
app.use(express.static("public"));

app.post("/chat", async (req: Request, res: Response) => {
  const { message, history = [] } = req.body ?? {};

  if (typeof message !== "string" || !message.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (!Array.isArray(history) || !history.every(isChatMessage)) {
    res.status(400).json({ error: "history must be an array of {role, content}" });
    return;
  }

  try {
    const { data } = await axios.post(
      "https://api.bigiverse.com/core/v1/responses",
      {
        model: "gpt-oss:20b",
        prompt: buildPrompt(history, message),
        stream: false,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.BIGIVERSE_API_KEY}`,
        },
      },
    );
    res.json({ reply: data.response });
  } catch (err) {
    console.error(axios.isAxiosError(err) ? (err.response?.data ?? err.message) : err);
    res.status(502).json({ error: "Model request failed" });
  }
});
app.post("/chat/stream", async (req: Request, res: Response) => {
  const parsed = parseChatBody(req.body);
  if (!parsed) {
    res.status(400).json({ error: "Invalid message or history" });
    return;
  }

  // Cancel the upstream request if the client disconnects
  const controller = new AbortController();
  res.on("close", () => controller.abort());

  try {
    const upstream = await axios.post(
      "https://api.bigiverse.com/core/v1/responses",
      {
        model: "gpt-oss:20b",
        prompt: buildPrompt(parsed.history, parsed.message),
        stream: true,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.BIGIVERSE_API_KEY}`,
        },
        responseType: "stream",
        signal: controller.signal,
      },
    );

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let buffer = "";
    for await (const chunk of upstream.data as AsyncIterable<Buffer>) {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? ""; // keep any incomplete last line for next chunk

      for (const line of lines) {
        if (!line.trim()) continue;
        const part = JSON.parse(line);
        if (part.response) {
          res.write(`data: ${JSON.stringify({ token: part.response })}\n\n`);
        }
        if (part.done) res.write("data: [DONE]\n\n");
      }
    }
    res.end();
  } catch (err) {
    if (controller.signal.aborted) return; // client left, nothing to report
    console.error(axios.isAxiosError(err) ? (err.response?.data ?? err.message) : err);
    if (!res.headersSent) {
      res.status(502).json({ error: "Model request failed" });
    } else {
      res.write(`data: ${JSON.stringify({ error: "Stream failed" })}\n\n`);
      res.end();
    }
  }
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`Server running on http://localhost:${port}`));