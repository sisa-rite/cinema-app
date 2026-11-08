import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { getCurrentUser, login, register } from "./auth.service.js";

const router = Router();

router.post("/register", async (req, res) => {
  const result = await register(req.body);
  res.status(201).json(result);
});

router.post("/login", async (req, res) => {
  const result = await login(req.body);
  res.status(200).json(result);
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await getCurrentUser(req.user.id);
  res.status(200).json({ user });
});

export default router;
