import { Router } from "express";
import { getScreeningSeats } from "./screenings.service.js";

const router = Router();

router.get("/:id/seats", async (req, res) => {
  const screening = await getScreeningSeats(req.params.id);
  res.status(200).json(screening);
});

export default router;
