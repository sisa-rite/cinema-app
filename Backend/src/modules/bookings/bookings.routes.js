import { Router } from "express";
import {
  createBooking,
  getMyBookings,
  getBooking,
  payBooking,
} from "./bookings.service.js";
import { optionalAuth, requireRole } from "../../middleware/auth.js";

const router = Router();
export const meBookingsRouter = Router();

router.post("/", optionalAuth, async (req, res) => {
  const booking = await createBooking(req.body, req.user);
  res.status(201).json(booking);
});

meBookingsRouter.get("/bookings", requireRole("customer"), async (req, res) => {
  const bookings = await getMyBookings(req.user.id);
  res.status(200).json(bookings);
});

router.get("/:reference", optionalAuth, async (req, res) => {
  const booking = await getBooking(
    req.params.reference,
    req.query.email,
    req.user,
  );
  res.status(200).json(booking);
});

router.post("/:reference/pay", optionalAuth, async (req, res) => {
  const booking = await payBooking(req.params.reference, req.body, req.user);
  res.status(200).json(booking);
});

export default router;
