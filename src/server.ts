import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { makePool } from "./db.js";

const isProd = process.env.NODE_ENV === "production";
const adminPin = process.env.ADMIN_PIN ?? (isProd ? "" : "admin");
if (isProd && adminPin.length < 12) {
  console.error("ADMIN_PIN must be set and at least 12 characters. Add it in the Render dashboard under Environment.");
  process.exit(1);
}

const pool = await makePool(process.env.DATABASE_URL);
if (!process.env.DATABASE_URL) console.warn("No DATABASE_URL: using in-memory data. It vanishes on restart.");
const app = await createApp(pool, loadConfig(), adminPin);
const port = Number(process.env.PORT ?? 3000);
// Express 5 hands listen errors to this callback instead of throwing, so check for one.
app.listen(port, (err?: Error) => {
  if (err) {
    const busy = (err as NodeJS.ErrnoException).code === "EADDRINUSE";
    console.error(busy ? `Port ${port} is already in use. Stop the other server, or run PORT=3001 npm start.` : err.message);
    process.exit(1);
  }
  console.log(`Stamp rally on http://localhost:${port}`);
});
