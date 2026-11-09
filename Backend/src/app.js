import express from "express";
import cors from "cors";
import pool from "./db.js";
import moviesRouter from "./modules/movies/movies.routes.js";
import screeningsRouter from "./modules/screenings/screenings.routes.js";

const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());
app.use("/api/movies", moviesRouter);
app.use("/api/screenings", screeningsRouter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/api/health/db", async (req, res, next) => {
  try {
    const { rows } = await pool.query("SELECT NOW() AS now");
    res.json({ status: "ok", database: "connected", time: rows[0].now });
  } catch (err) {
    next(err);
  }
});

app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "The requested resource was not found." },
  });
});

app.use((err, req, res, _next) => {
  if (Number.isInteger(err.status) && err.code) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  if (err.type === "entity.parse.failed") {
    res.status(400).json({
      error: {
        code: "INVALID_JSON",
        message: "Request body must contain valid JSON.",
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "An unexpected error occurred.",
    },
  });
});

export default app;
