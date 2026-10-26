import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { makePool } from "./db.js";

const isProd = process.env.NODE_ENV === "production";
const adminPin = process.env.ADMIN_PIN ?? (isProd ? "" : "admin");
if (!adminPin) {
  console.error("ADMIN_PIN is not set. Add it in the Render dashboard under Environment.");
  process.exit(1);
}

const pool = await makePool(process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) console.warn("No DATABASE_URL: using in-memory data. It vanishes on restart.");
const app = await createApp(pool, loadConfig(), adminPin);
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Stamp rally on http://localhost:${port}`));
