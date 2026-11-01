import express from "express";
import cors from "cors";
import pool from "./db.js";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/health/db", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT NOW() AS now");
    res.json({ status: "ok", database: "connected", time: rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", database: "unreachable" });
  }
});

export default app;
