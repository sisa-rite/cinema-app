import "dotenv/config";
import { after, test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";

process.env.JWT_SECRET = "fr013-auth-test-secret";

const { default: app } = await import("../src/app.js");
const { requireRole } = await import("../src/middleware/auth.js");
const { default: pool } = await import("../src/db.js");

const hasDatabase = Boolean(process.env.DATABASE_URL);
const createdEmails = [];

after(async () => {
  if (createdEmails.length > 0) {
    await pool.query("DELETE FROM users WHERE email = ANY($1::text[])", [
      createdEmails,
    ]);
  }
  await pool.end();
});

test(
  "authentication endpoints and role middleware",
  { skip: !hasDatabase },
  async (t) => {
    const email = `fr013-${crypto.randomUUID()}@example.test`;
    const password = "customer-password";
    createdEmails.push(email);
    let customerToken;
    let customerUser;

    await t.test("registers a customer and returns a JWT", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          name: "FR-013 Test Customer",
          email: email.toUpperCase(),
          password,
          role: "admin",
        });

      assert.equal(response.status, 201);
      assert.deepEqual(Object.keys(response.body).sort(), ["token", "user"]);
      assert.deepEqual(Object.keys(response.body.user).sort(), [
        "email",
        "id",
        "name",
        "role",
        "theatreId",
      ]);
      assert.equal(response.body.user.email, email);
      assert.equal(response.body.user.role, "customer");
      assert.equal(JSON.stringify(response.body).includes("passwordHash"), false);
      assert.equal(JSON.stringify(response.body).includes("password_hash"), false);

      customerToken = response.body.token;
      customerUser = response.body.user;
      const decoded = jwt.decode(customerToken, { complete: true });
      assert.equal(decoded.header.alg, "HS256");
      assert.equal(decoded.payload.role, "customer");
      assert.equal(decoded.payload.sub, String(customerUser.id));
      assert.equal(decoded.payload.theatreId, null);
      assert.equal(decoded.payload.exp - decoded.payload.iat, 8 * 60 * 60);
    });

    await t.test("rejects duplicate e-mail addresses", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({ name: "Another Customer", email, password });

      assert.equal(response.status, 409);
      assert.equal(response.body.error.code, "EMAIL_TAKEN");
    });

    await t.test("rejects passwords shorter than eight bytes", async () => {
      const response = await request(app)
        .post("/api/auth/register")
        .send({
          name: "Short Password",
          email: `short-${crypto.randomUUID()}@example.test`,
          password: "1234567",
        });

      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "VALIDATION_ERROR");
      assert.equal(
        response.body.error.details.fields.password,
        "Password must be 8–72 bytes",
      );
    });

    const adminPassword = process.env.SEED_PASSWORD ?? "Rio-demo-2026";
    let adminToken;
    await t.test("logs in the seeded admin", async () => {
      const response = await request(app).post("/api/auth/login").send({
        email: "admin@rio.test",
        password: adminPassword,
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.user.role, "admin");
      adminToken = response.body.token;
      const decoded = jwt.decode(adminToken);
      assert.equal(decoded.role, "admin");
    });

    await t.test("returns one credentials error for login failures", async () => {
      const wrongPassword = await request(app).post("/api/auth/login").send({
        email: "admin@rio.test",
        password: "not-the-seed-password",
      });
      const unknownEmail = await request(app).post("/api/auth/login").send({
        email: `unknown-${crypto.randomUUID()}@example.test`,
        password: "not-the-seed-password",
      });

      assert.equal(wrongPassword.status, 401);
      assert.equal(unknownEmail.status, 401);
      assert.deepEqual(wrongPassword.body, unknownEmail.body);
      assert.equal(wrongPassword.body.error.code, "INVALID_CREDENTIALS");
    });

    await t.test("loads the current user from the database", async () => {
      const missingToken = await request(app).get("/api/auth/me");
      assert.equal(missingToken.status, 401);
      assert.equal(missingToken.body.error.code, "UNAUTHORIZED");

      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${customerToken}`);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { user: customerUser });

      await pool.query("UPDATE users SET active = false WHERE email = $1", [
        email,
      ]);
      try {
        const inactive = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${customerToken}`);
        assert.equal(inactive.status, 401);
        assert.equal(inactive.body.error.code, "UNAUTHORIZED");
      } finally {
        await pool.query("UPDATE users SET active = true WHERE email = $1", [
          email,
        ]);
      }
    });

    await t.test("enforces roles on a test-only route", async () => {
      const roleApp = express();
      roleApp.get("/admin", requireRole("admin"), (req, res) => {
        res.status(200).json({ user: req.user });
      });

      const customerResponse = await request(roleApp)
        .get("/admin")
        .set("Authorization", `Bearer ${customerToken}`);
      const adminResponse = await request(roleApp)
        .get("/admin")
        .set("Authorization", `Bearer ${adminToken}`);

      assert.equal(customerResponse.status, 403);
      assert.equal(customerResponse.body.error.code, "FORBIDDEN");
      assert.equal(adminResponse.status, 200);
      assert.equal(adminResponse.body.user.role, "admin");
    });
  },
);
