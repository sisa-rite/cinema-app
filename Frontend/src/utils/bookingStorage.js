// The e-mail identifies the booking, so it stays in this tab only (never in the URL).
const keyFor = (reference) => `rio-booking-${reference}`;

export function saveBookingEmail(reference, email) {
  try {
    sessionStorage.setItem(keyFor(reference), email);
  } catch {
    // Storage can be blocked; the checkout page then asks for the e-mail.
  }
}

export function loadBookingEmail(reference) {
  try {
    return sessionStorage.getItem(keyFor(reference));
  } catch {
    return null;
  }
}
