import { useEffect, useRef, useState, type FormEvent } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function setLastReply(text: string) {
    setMessages((prev) => {
      const copy = [...prev];
      copy[copy.length - 1] = { role: "assistant", content: text };
      return copy;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    const history = messages;
    setInput("");
    setLoading(true);
    setMessages([
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);

    let reply = "";
    try {
      const res = await fetch("/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const event of events) {
          if (!event.startsWith("data: ")) continue;
          const data = event.slice(6);
          if (data === "[DONE]") continue;
          const parsed = JSON.parse(data);
          if (parsed.error) throw new Error(parsed.error);
          reply += parsed.token;
          setLastReply(reply);
        }
      }
    } catch (err) {
      setLastReply("Error: " + (err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <h1 className="mb-4 text-xl font-semibold">Chatbot</h1>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {messages.length === 0 && (
          <p className="m-auto text-gray-400">Say hello to get started.</p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2 ${
              m.role === "user"
                ? "self-end bg-blue-600 text-white"
                : "self-start bg-gray-200 text-gray-900"
            }`}
          >
            {m.content || "..."}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 outline-none focus:border-blue-600"
        />
        <button
          disabled={loading}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}