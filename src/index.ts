import axios from "axios";
import * as dotenv from "dotenv";
import express, { type Request, type Response } from "express";
dotenv.config();
const app = express();
app.get("/", async (req: Request, res: Response) => {
  const body = {
    model: "gpt-oss:20b",
    prompt: "Write hello world in c++.",
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
  res.json(response.data);
});

const port = 3000;

app.listen(port, () => {
  console.log(`Server is running on port http://localhost:${port}`);
});
