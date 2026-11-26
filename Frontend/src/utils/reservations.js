import { formatDayLabel, formatTime } from "./format.js";

const RESERVATION_CUTOFF_MS = 2 * 60 * 60 * 1000;

const NOT_CANCELLABLE_MESSAGES = {
  paid: "This booking is already paid and cannot be cancelled.",
  expired: "This reservation has already expired.",
};

// For display only; the server's paymentDeadline is the real one.
export function reservationDeadline(startsAt) {
  return new Date(Date.parse(startsAt) - RESERVATION_CUTOFF_MS).toISOString();
}

export function isReservationClosed(startsAt, now = Date.now()) {
  return now > Date.parse(startsAt) - RESERVATION_CUTOFF_MS;
}

// "Sat 28 Nov, 16:00" (or "Today, 16:00") in Helsinki time.
export function formatDeadline(iso) {
  return `${formatDayLabel(iso)}, ${formatTime(iso)}`;
}

export function cancelErrorMessage(error) {
  if (error.code === "BOOKING_NOT_CANCELLABLE") {
    return NOT_CANCELLABLE_MESSAGES[error.details?.status] ?? error.message;
  }
  return "Cancelling failed. Please try again.";
}
