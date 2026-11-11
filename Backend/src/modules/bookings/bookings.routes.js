import { Router } from "express";
import { createBooking, getBooking } from "./bookings.service.js";

const router = Router();

router.post("/", async (req, res) => {
  const booking = await createBooking(req.body);
  res.status(201).json(booking);
});

router.get("/:reference", async (req, res) => {
  const booking = await getBooking(req.params.reference, req.query.email);
  res.status(200).json(booking);
});

export default router;
