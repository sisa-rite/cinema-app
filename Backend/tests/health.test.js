import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

test("GET /api/health returns status ok", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});
