import axios from "axios";
async function firstAiResponse() {
  const body = {
    model: "gemma4:31b",
    prompt: "Why is the sky blue?",
    stream: false,
  };
  const response = await axios.post(
    "https://api.bigiverse.com/core/v1/responses",
    body,
    {
      headers: {
        Authorization: `Bearer ${process.env.BIGIVERSE_API_KEY}`,
      },
    },
  );
}
