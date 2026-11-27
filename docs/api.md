# API — Rio Theatres

Version 5 (Sprint 4, 25 Nov 2026 — TD-004: loyalty discount, OQ-005). This file is the contract between frontend and backend.
Change it only by a pull request that both sides review.

## Conventions

- Base path: `/api`. Request and response bodies are JSON.
- Keys are camelCase in JSON, snake_case in the database.
- Times are ISO 8601 strings in UTC (`2026-11-12T15:30:00.000Z`). The frontend shows them in `Europe/Helsinki`.
- Prices are numbers in euros (`12.5`), never strings.
- Protected endpoints need the header `Authorization: Bearer <token>`.
- Every error has the same shape:

```json
{ "error": { "code": "SEATS_UNAVAILABLE", "message": "Some seats are no longer available.", "details": {} } }
```

`details` is optional and only present where this document says so. For `VALIDATION_ERROR` it is
`{ "fields": { "email": "Invalid e-mail address", "seatIds": "Select 1 to 10 seats" } }` (field name → message).

### Error codes

| Status | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body or query is invalid; `details.fields` lists the invalid fields |
| 400 | `INVALID_ID` | A path id is not a positive integer |
| 400 | `INVALID_CITY` | City is missing or not `oulu` / `tampere` |
| 401 | `UNAUTHORIZED` | Token missing, invalid or expired |
| 401 | `INVALID_CREDENTIALS` | Wrong e-mail or password (same message for both) |
| 403 | `FORBIDDEN` | Logged in, but the role is not allowed |
| 404 | `MOVIE_NOT_FOUND` / `SCREENING_NOT_FOUND` / `BOOKING_NOT_FOUND` / `NOT_FOUND` | Resource does not exist or is not published |
| 409 | `EMAIL_TAKEN` | Registration with an e-mail that already exists |
| 409 | `SEATS_UNAVAILABLE` | At least one requested seat is held, sold or not bookable; `details.seatIds` lists them |
| 409 | `SALES_CLOSED` | The screening has already started (BR-007) |
| 409 | `WHEELCHAIR_SPACES_UNAVAILABLE` | Not enough free wheelchair spaces; `details.available` = how many are left |
| 409 | `HOLD_EXPIRED` | Paying or reserving a booking whose 15-minute hold has expired |
| 409 | `RESERVATION_CLOSED` | Reserving less than 2 hours before the screening starts — pay now instead |
| 409 | `RESERVATION_EXPIRED` | Paying or reserving a reservation after its payment deadline |
| 409 | `BOOKING_ALREADY_PAID` | Reserving a booking that is already paid |
| 409 | `BOOKING_NOT_CANCELLABLE` | Cancelling a paid or expired booking; `details.status` = the booking's status |
| 409 | `MOVIE_NOT_PUBLISHED` | Publishing a screening of an unpublished movie |
| 409 | `SCREENING_OVERLAP` | The hall is already used at that time; `details.screeningIds` lists the conflicting screenings |
| 409 | `SCREENING_HAS_BOOKINGS` | Changing or deleting a screening that already has tickets |
| 409 | `MOVIE_HAS_BOOKINGS` | Hiding a movie that has upcoming screenings with tickets (held, reserved or paid) |
| 500 | `INTERNAL_ERROR` | Unexpected error; details only in the server log |

---

## Movies (done in Sprint 1)

- `GET /api/movies?city=oulu|tampere` — movies with upcoming published screenings in the city.
- `GET /api/movies/:id?city=oulu|tampere` — one movie with its upcoming screenings in the city.
  Each screening has `basePrice`, `isPremiere` and `prices` (`{ "adult": 14.38, "child": 7.19 }` for a 12.50 € premiere) — the ticket prices after the pricing rules (see "Pricing — FR-021"). Show `prices.adult`, not `basePrice`, to customers; `basePrice` stays for compatibility.

Full response examples: README → API.

---

## Seats — FR-003, FR-004

### `GET /api/screenings/:id/seats`

Public. Returns the screening, its hall and the state of every seat.

Response `200`:

```json
{
  "screening": {
    "id": 42,
    "startsAt": "2026-11-12T15:30:00.000Z",
    "basePrice": 12.5,
    "isPremiere": false,
    "prices": { "adult": 12.5, "child": 6.25 },
    "childMaxAge": 12,
    "wheelchairSpaces": { "total": 10, "available": 8 },
    "movie": { "id": 3, "title": "Dune: Part Two", "durationMinutes": 166, "ageRating": "K-12", "posterUrl": "https://..." },
    "theatre": { "name": "Cinema RIO Oulu", "city": "oulu" },
    "hall": { "id": 1, "name": "Hall 1", "totalRows": 10, "seatsPerRow": 10 }
  },
  "seats": [
    { "id": 101, "rowNumber": 1, "seatNumber": 1, "posX": 10, "posY": 1, "state": "owner" },
    { "id": 102, "rowNumber": 1, "seatNumber": 2, "posX": 9, "posY": 1, "state": "available" },
    { "id": 103, "rowNumber": 1, "seatNumber": 3, "posX": 8, "posY": 1, "state": "held" }
  ]
}
```

Rules:
- Only published screenings → otherwise `404 SCREENING_NOT_FOUND`. A screening that has started is still returned (the frontend shows "sales closed"). A screening of an unpublished movie counts as not published → `404 SCREENING_NOT_FOUND`.
- `seats` contains every seat of the hall, sorted by `posY`, then `posX`.
- `posX` = column from the left of the map (1…seatsPerRow), `posY` = physical row from the screen (1 = nearest). The map is drawn with the screen at the bottom.
- `state`:
  - `owner` — seat type `owner` (seat 1), never bookable
  - `blocked` — seat type `blocked`, never bookable
  - `sold` — has a ticket in a booking with status `paid`, or `reserved` with `payment_deadline > now()`. A reservation past its deadline counts as available even if the expiry job has not run yet.
  - `held` — has a ticket in a booking with status `held` and `hold_expires_at > now()`
  - `available` — everything else. A hold that has expired counts as available even if the expiry job has not run yet.
- `city` is lowercase (`oulu` / `tampere`), like in the movies API.
- `prices` = the price of one ticket of each type after the pricing rules (FR-021, see "Pricing" below). They never include the loyalty discount (see "Loyalty discount — OQ-005"). The frontend shows them; the server computes the real total again on booking.
- `childMaxAge` = the oldest age that still gets a child ticket (0–12, BR-012).
- `wheelchairSpaces` (FR-023, BR-014): `total` = `halls.wheelchair_spaces`, `available` = `total` minus wheelchair tickets in active bookings (same rule as `held` / `sold` above: valid holds, paid bookings and reservations with `payment_deadline > now()`). The spaces are in front of row 1 and have no seat numbers.

---

## Bookings — FR-005, FR-006, FR-008

### `POST /api/bookings`

Public (guest checkout), optional customer token (see "Customer accounts and reservations"). Holds seats for 15 minutes.

Request:

```json
{ "screeningId": 42, "seatIds": [102, 104], "childTickets": 1, "wheelchairSpaces": 1, "email": "guest@example.com" }
```

Validation (`400 VALIDATION_ERROR`, `details.fields`):
- `screeningId`: positive integer.
- `seatIds`: array of unique positive integers; may be empty when `wheelchairSpaces` > 0.
- `wheelchairSpaces`: optional, whole number 0–10 (default 0).
- `seatIds` + `wheelchairSpaces` together: 1–10 tickets (BR-005) → otherwise the error is on `seatIds`.
- `childTickets`: optional, whole number from 0 to the number of seats (default 0). The last `childTickets` seats get a child ticket; which seat it is does not matter for the price.
- `email`: required for guests, valid e-mail format, max 254 characters, stored lowercase. With a customer token it is optional and ignored.

Response `201`:

```json
{
  "id": 17,
  "reference": "RIO-7K3QX9",
  "status": "held",
  "screeningId": 42,
  "email": "guest@example.com",
  "holdExpiresAt": "2026-11-09T12:15:00.000Z",
  "paymentDeadline": null,
  "seats": [
    { "id": 102, "rowNumber": 1, "seatNumber": 2, "ticketType": "adult", "price": 12.5, "discountNote": null },
    { "id": 104, "rowNumber": 1, "seatNumber": 4, "ticketType": "child", "price": 6.25, "discountNote": null }
  ],
  "wheelchairSpaces": 1,
  "wheelchairDiscounts": 0,
  "totalPrice": 31.25
}
```

Rules:
- Screening not found or not published → `404 SCREENING_NOT_FOUND`. A screening of an unpublished movie counts as not published → `404 SCREENING_NOT_FOUND`.
- `starts_at <= now()` → `409 SALES_CLOSED`.
- Any seat not in the screening's hall, of type `owner` / `blocked`, or already held/sold → `409 SEATS_UNAVAILABLE` with `details.seatIds`. Nothing is saved.
- Everything runs in ONE transaction: mark expired holds (`held`, `hold_expires_at <= now()`) and reservations past their deadline (`reserved`, `payment_deadline <= now()`) of this screening as `expired` and delete their tickets, insert the booking, insert one ticket per seat. Both must be cleaned here, not only by the expiry job: the seat map already shows these seats as available, and their old tickets would otherwise make the insert fail on the unique index.
- The unique constraint on `tickets (screening_id, seat_id)` decides who wins when two requests come at the same time. On a unique violation (PostgreSQL error code `23505`) the backend rolls back, reads which of the requested seats are now taken and returns `409 SEATS_UNAVAILABLE` with those `details.seatIds`.
- `holdExpiresAt` = now + 15 minutes, set by the server.
- `reference` = `RIO-` + 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I), generated by the server with `crypto.randomInt`. If it collides with an existing reference (unique constraint), generate a new one and retry (max 3 times).
- Wheelchair spaces: one ticket per space with `seat_id = NULL`, `is_wheelchair = true`, ticket type `adult`. When `wheelchairSpaces` > 0 the transaction first locks the screening row (`SELECT … FOR UPDATE`), because no unique index protects seatless tickets. More than `available` → `409 WHEELCHAIR_SPACES_UNAVAILABLE` with `details.available`. Nothing is saved.
- `totalPrice` = the sum of the ticket prices (see "Pricing"), including a loyalty discount if the booking gets one.
- `seats[].discountNote` = `tickets.discount_note`: `null`, or `"Every 10th ticket −50 %"` when that seat ticket got the loyalty discount. `wheelchairDiscounts` = how many of the booking's wheelchair spaces got it (usually `0`); wheelchair spaces stay a count. Every booking response in this document has both.
- `paymentDeadline` = `bookings.payment_deadline` (ISO string), `null` unless the booking was reserved. Every booking response in this document has it.

### Pricing — FR-021 (BR-012)

- Premiere: +15 % on `basePrice`, applied first. Child ticket (age 0–12): −50 % of that. Rounded to 0.01 € once, after the final calculation. Example: base 10 € premiere → adult 11.50 €, child 5.75 €.
- Wheelchair spaces cost an adult ticket (BR-014: no special pricing).
- Every 10th ticket of a customer with an account costs −50 % — see [Loyalty discount — OQ-005](#loyalty-discount--oq-005) below. Guest checkout never applies it.

### Loyalty discount — OQ-005

Agreed with the client (Jukka): every 10th ticket of a customer with an account is half price.

Rules:
1. **Who:** only customers with an account — `POST /api/bookings` with a valid token of role `customer`. Guests and `cashier` / `admin` tokens (treated as guests, see "Optional customer token") never get it.
2. **What counts:** every 10th ticket of the customer gets −50 %. Tickets are counted since registration, across all bookings and screenings, including the tickets of the booking being created.
3. **When:** the price is decided when the hold is created (`POST /api/bookings`) and never changes afterwards — also not when a reservation is paid later (`/reserve`, `/pay`).
4. **Tickets so far** (`count`) at the moment of the hold = all tickets (seats and wheelchair spaces, adult and child) of the customer's bookings (`bookings.user_id`) that are:
   - `paid`;
   - `held` with `hold_expires_at > now()`;
   - `reserved` with `payment_deadline > now()`.

   Cancelled and expired bookings do not count (they have no tickets anyway). Guest bookings with the same e-mail do not count.
5. **Positions:** the new booking's tickets get positions `count + 1 … count + n`. Every position divisible by 10 is a discount. One booking has at most 10 tickets (BR-005), so it contains at most one such position.
6. **Which ticket gets it:** child tickets count toward the positions but never get the discount. If the booking contains a discount position, the discount goes to the first eligible ticket in this order: adult seat tickets (by `rowNumber`, then `seatNumber`), then wheelchair spaces. Only when the booking has nothing but child tickets is that discount lost. Which ticket gets it does not change the count or the positions of later discounts.
7. **Price:** discounted price = the ticket's unrounded normal price (`basePrice`, × 1.15 for a premiere, FR-021) × 0.5, rounded to 0.01 € once at the end — the same calculation as the child price in `pricing.js`. Example: premiere, base 12.50 € → 14.375 × 0.5 = 7.1875 → 7.19 €. Wheelchair spaces can get it (they cost an adult ticket, BR-014).
8. **Storage:** the discounted ticket stores `tickets.discount_note = 'Every 10th ticket −50 %'` and `tickets.price` = the discounted price. `totalPrice` = the sum of the ticket prices, as before. In responses: `seats[].discountNote` for seats, `wheelchairDiscounts` for wheelchair spaces.
9. **Concurrency:** for a customer, the booking transaction first locks the user row (`SELECT id FROM users WHERE id = $1 FOR UPDATE`), then counts. Two parallel holds of the same customer therefore never get the same positions. The user row is locked before the screening row (wheelchair spaces), so the locks are always taken in the same order.
10. **No recalculation:** if an earlier booking is later cancelled or expires, discounts already given in other bookings stay.

Examples (base price 12.50 €, no premiere → adult 12.50 €, child 6.25 €):
- 8 tickets so far, buys 5 adult tickets → positions 9–13 → position 10 is a discount → 4 × 12.50 € + 1 × 6.25 € = 56.25 €. Afterwards 13 tickets are counted; 3 of them count toward the next discount (position 20), so 7 tickets remain until it.
- 0 so far, buys 10 tickets (8 adult + 2 child) → positions 1–10 → position 10 is a discount and goes to the first adult seat (rule 6) → 7 × 12.50 € + 6.25 € + 2 × 6.25 € = 106.25 €.
- 9 so far, buys 1 child ticket → position 10 falls on a child ticket and the booking has no other ticket → no discount, 6.25 €. The next ticket is position 11.

`GET /api/screenings/:id/seats` `prices` and the movie `prices` never include this discount; the frontend shows the hint from `GET /api/me/loyalty`, and the price returned by `POST /api/bookings` is the real one.

### `GET /api/bookings/:reference?email=guest@example.com`

Public, optional customer token. Used to show the hold countdown after a page reload, for payment and for "My bookings".
- Access: `email` matches the booking's e-mail (case-insensitive), OR the token belongs to the customer who owns the booking — see "Who may read or pay a booking". With such a token `email` may be left out. Otherwise → `404 BOOKING_NOT_FOUND` (do not reveal that the reference exists).
- Response `200`: same shape as `POST /api/bookings`, plus `paidAt` (ISO string, or `null` when not paid). A hold whose `holdExpiresAt` has passed, or a reservation whose `paymentDeadline` has passed, is returned with `status: "expired"`, even if the expiry job has not updated it yet.
- Possible `status` values in Sprint 4: `held`, `reserved`, `paid`, `expired`, `cancelled`. Guests only ever see `held`, `paid` and `expired`. The checkout page shows the confirmation for `paid` and "Your hold has expired" only for `expired`.
- Simplification: the e-mail is sent in the query string, so it can appear in server logs. Production would use a separate secret token instead.

### Expiry (background job, no endpoint)

Every minute, in ONE transaction:
- bookings with `status = 'held'` and `hold_expires_at <= now()` → `status = 'expired'`, their tickets are deleted;
- bookings with `status = 'reserved'` and `payment_deadline <= now()` → `status = 'expired'`, their tickets are deleted.

The tickets must be deleted because of the unique index on `tickets (screening_id, seat_id)`: as long as an old ticket row exists, the seat stays blocked and every new hold on it fails with `409 SEATS_UNAVAILABLE`. Until the job runs, the API already treats such bookings as expired (seat map, `GET`, `POST /api/bookings` cleanup).

---

## Payment — FR-007, FR-009 (Sprint 3)

### `POST /api/bookings/:reference/pay`

Public (guest checkout), optional customer token. Simulated online payment: no card data is entered, sent or stored (CAD-002). Pays a hold (pay now) or a reservation (pay later, FR-016).

Request:

```json
{ "email": "guest@example.com", "acceptNoRefund": true }
```

Validation (`400 VALIDATION_ERROR`, `details.fields`):
- `email`: required for guests, valid e-mail format (compared lowercase). With the token of the customer who owns the booking it may be left out.
- `acceptNoRefund`: must be `true` — the customer confirmed that paid tickets cannot be refunded (FR-009, BR-008). Message: `"Confirm that paid tickets cannot be refunded"`.

Response `200`: the booking in the same shape as `GET /api/bookings/:reference`, with `status: "paid"` and `paidAt` set:

```json
{
  "id": 17,
  "reference": "RIO-7K3QX9",
  "status": "paid",
  "screeningId": 42,
  "email": "guest@example.com",
  "holdExpiresAt": "2026-11-09T12:15:00.000Z",
  "paymentDeadline": null,
  "paidAt": "2026-11-09T12:08:41.000Z",
  "seats": [
    { "id": 102, "rowNumber": 1, "seatNumber": 2, "ticketType": "adult", "price": 12.5, "discountNote": null },
    { "id": 104, "rowNumber": 1, "seatNumber": 4, "ticketType": "adult", "price": 12.5, "discountNote": null }
  ],
  "wheelchairSpaces": 0,
  "wheelchairDiscounts": 0,
  "totalPrice": 25
}
```

Rules (checked in this order, inside ONE transaction):
1. Load the booking with `SELECT … FOR UPDATE` by reference, then check access by e-mail or customer token (see "Who may read or pay a booking"). Not found or no access → `404 BOOKING_NOT_FOUND`.
2. Already `paid` → return `200` with the paid booking again and do NOT create a second payment. The frontend disables the button after the first click ("Pay" → "Paying…"); this server rule is the safety net for two tabs or a network retry.
3. Can it be paid?
   - `held` with `hold_expires_at > now()` → yes;
   - `reserved` with `payment_deadline > now()` → yes;
   - `reserved` with `payment_deadline <= now()` → `409 RESERVATION_EXPIRED`;
   - anything else (`held` past its hold, `expired`, `cancelled`) → `409 HOLD_EXPIRED`.
4. The screening has started (`starts_at <= now()`) → `409 SALES_CLOSED`. (For a reservation this cannot happen before the deadline, which is 2 hours before the start; the check stays as a safety net.)
5. `UPDATE bookings SET status = 'paid'`, then `INSERT INTO payments (booking_id, method, amount, paid_at) VALUES (…, 'online', total_price, now())`. The amount always comes from the database, never from the request. `payment_deadline` and `hold_expires_at` stay as history.
- `FOR UPDATE` makes the payment, the expiry job, reserve and cancel wait for each other: a hold or reservation is either paid or expired/cancelled, never both.
- `paidAt` = `payments.paid_at` of the booking's payment.
- Simplification: anyone who knows the reference and the e-mail can pay. A real system would use a payment provider (Stripe Checkout) with webhooks and receipts.
- `acceptNoRefund` is required for reservations too: the no-refund notice is confirmed at payment, not at reservation.

### Customer-side rules without a new endpoint

- **FR-009 No-refund notice:** shown on the checkout page; the "Pay" button stays disabled until the customer ticks the confirmation. The server enforces it with `acceptNoRefund`.
- **FR-010 Age rating warning:** uses `screening.movie.ageRating` from `GET /api/screenings/:id/seats`. Every rating except `S` and `null` (i.e. `K-7`, `K-12`, `K-16`, `K-18`) shows the ID-check pop-up when the customer has selected seats and clicks "Continue", before the e-mail step; the pop-up names the rating. The customer must confirm it to continue. No server check — it is information, not a sales block (BR-011). Ticket types are not restricted by the rating.

---

## Customer accounts and reservations — FR-014, FR-015, FR-016, FR-018 (Sprint 4)

Client requirements (Jukka): a customer can reserve seats and pay later, at the latest 2 hours before the screening starts. Reservation needs an account; guests can still buy (hold + pay now) without one.

Booking lifecycle:

```
held ──pay──────────────────────────────▶ paid
 │ └─reserve──▶ reserved ──pay──────────▶ paid
 │                 │  └─deadline passed─▶ expired
 │                 └─cancel─────────────▶ cancelled
 ├─hold passed──────────────────────────▶ expired
 └─cancel───────────────────────────────▶ cancelled
```

### Optional customer token (new middleware `optionalAuth`)

Used on `POST /api/bookings`, `GET /api/bookings/:reference` and `POST /api/bookings/:reference/pay`.
- No `Authorization` header → guest (`req.user` is not set).
- Header present but the token is invalid or expired → `401 UNAUTHORIZED`. Do not silently treat it as a guest: the frontend then asks the user to log in again.
- Valid token → `req.user` as in `requireAuth`. Only role `customer` links bookings to an account; a `cashier` / `admin` token on these endpoints is treated as a guest (the e-mail rules apply).
- The endpoints that need an account (`reserve`, `cancel`, `GET /api/me/bookings`) use `requireRole('customer')`: no token → `401 UNAUTHORIZED`, cashier/admin token → `403 FORBIDDEN`.

### `POST /api/bookings` with a customer token

- The booking gets `user_id` = the customer's id; `guest_email` stays `NULL`.
- `email` in the body is optional and ignored. The response `email` is the account's e-mail.
- The loyalty discount applies (see "Loyalty discount — OQ-005"): the user row is locked and the tickets so far are counted in the same transaction.
- Everything else (validation, 15-minute hold, ticket types, wheelchair spaces, concurrency) stays as described in "Bookings".
- The booking starts as `held`, like a guest booking. The customer then pays now (`/pay`) or reserves (`/reserve`).

### Who may read or pay a booking

`GET /api/bookings/:reference` and `POST /api/bookings/:reference/pay` are allowed when:
- `email` matches the booking's e-mail (case-insensitive), as before, OR
- the request has the token of the customer who owns the booking (`bookings.user_id = req.user.id`, role `customer`).

"The booking's e-mail" = `guest_email`, or the user's e-mail (`users.email`) for account bookings.
Neither condition met → `404 BOOKING_NOT_FOUND` (never reveal that the reference exists).

### `POST /api/bookings/:reference/reserve`

`requireRole('customer')`. No body. Turns a valid hold into a reservation that is paid later (FR-015).

Response `200`: the booking in the same shape as `GET /api/bookings/:reference`:

```json
{
  "id": 18,
  "reference": "RIO-M4P8TW",
  "status": "reserved",
  "screeningId": 57,
  "email": "anna@example.com",
  "holdExpiresAt": "2026-11-24T10:15:00.000Z",
  "paymentDeadline": "2026-11-28T14:00:00.000Z",
  "paidAt": null,
  "seats": [
    { "id": 215, "rowNumber": 5, "seatNumber": 6, "ticketType": "adult", "price": 12.5, "discountNote": null },
    { "id": 216, "rowNumber": 5, "seatNumber": 7, "ticketType": "adult", "price": 12.5, "discountNote": null }
  ],
  "wheelchairSpaces": 0,
  "wheelchairDiscounts": 0,
  "totalPrice": 25
}
```

Rules (checked in this order, inside ONE transaction, booking loaded with `SELECT … FOR UPDATE`):
1. Not found, or `user_id` is not the caller's id → `404 BOOKING_NOT_FOUND`. A guest booking (no `user_id`) can never be reserved.
2. Already `reserved`:
   - `payment_deadline > now()` → `200` with the booking (idempotent, deadline unchanged);
   - `payment_deadline <= now()` → `409 RESERVATION_EXPIRED` (the reservation is treated as expired even before the expiry job runs).
3. `paid` → `409 BOOKING_ALREADY_PAID`.
4. Not `held`, or `hold_expires_at <= now()` → `409 HOLD_EXPIRED`.
5. The screening has started (`starts_at <= now()`) → `409 SALES_CLOSED`.
6. `now() > starts_at − 2 hours` → `409 RESERVATION_CLOSED`, message `"Reservations close 2 hours before the screening. Pay now instead."` The hold stays valid, so the customer can still pay it.
7. `UPDATE bookings SET status = 'reserved', payment_deadline = starts_at − interval '2 hours'`. `hold_expires_at` is not changed (kept as history). Response `200`: the booking.
- The tickets stay; the seats are now `sold` on the seat map until the reservation is paid, cancelled or expires.
- `paymentDeadline` is computed by the server from the screening, never sent by the client.

### Paying a reservation

Uses `POST /api/bookings/:reference/pay` (see "Payment", rule 3): a `reserved` booking with `payment_deadline > now()` can be paid; past the deadline → `409 RESERVATION_EXPIRED`. `acceptNoRefund` is still required; the payment row is the same as for a hold (`method 'online'`, `cashier_id` `NULL`).

### `POST /api/bookings/:reference/cancel`

`requireRole('customer')`. No body. The customer cancels their own unpaid booking (FR-018).

Response `200`:

```json
{
  "id": 18,
  "reference": "RIO-M4P8TW",
  "status": "cancelled",
  "screeningId": 57,
  "email": "anna@example.com",
  "holdExpiresAt": "2026-11-24T10:15:00.000Z",
  "paymentDeadline": "2026-11-28T14:00:00.000Z",
  "paidAt": null,
  "seats": [],
  "wheelchairSpaces": 0,
  "wheelchairDiscounts": 0,
  "totalPrice": 25
}
```

Rules (checked in this order, inside ONE transaction, booking loaded with `SELECT … FOR UPDATE`):
1. Not found, or `user_id` is not the caller's id → `404 BOOKING_NOT_FOUND`.
2. Already `cancelled` → `200` with the booking (idempotent).
3. `paid` or `expired` → `409 BOOKING_NOT_CANCELLABLE` with `details.status` (`"paid"` / `"expired"`). Paid tickets are not refunded (BR-008). A hold past `hold_expires_at` or a reservation past `payment_deadline` counts as `expired` here, even before the expiry job runs.
4. `held` or `reserved` → `UPDATE bookings SET status = 'cancelled'` **and delete the booking's tickets in the same transaction**. Response `200`: the booking with `seats: []`, `wheelchairSpaces: 0`, `wheelchairDiscounts: 0`; `totalPrice` is kept.
- Why the tickets must be deleted: the unique index on `tickets (screening_id, seat_id)` would otherwise keep the seats blocked — every new hold on them would fail with `409 SEATS_UNAVAILABLE`, although the booking is cancelled. Deleting them frees the seats immediately.

### `GET /api/me/bookings`

`requireRole('customer')`. The customer's bookings for "My bookings".

Response `200`:

```json
{
  "upcoming": [
    {
      "reference": "RIO-M4P8TW",
      "status": "reserved",
      "paymentDeadline": "2026-11-28T14:00:00.000Z",
      "paidAt": null,
      "seats": [
        { "id": 215, "rowNumber": 5, "seatNumber": 6, "ticketType": "adult", "price": 12.5, "discountNote": null },
        { "id": 216, "rowNumber": 5, "seatNumber": 7, "ticketType": "adult", "price": 12.5, "discountNote": null }
      ],
      "wheelchairSpaces": 0,
      "wheelchairDiscounts": 0,
      "totalPrice": 25,
      "screening": {
        "id": 57,
        "startsAt": "2026-11-28T16:00:00.000Z",
        "movie": { "id": 3, "title": "Dune: Part Two", "posterUrl": "https://..." },
        "theatre": { "name": "Cinema RIO Oulu", "city": "oulu" },
        "hall": { "name": "Hall 1" }
      }
    }
  ],
  "past": [
    {
      "reference": "RIO-7K3QX9",
      "status": "paid",
      "paymentDeadline": null,
      "paidAt": "2026-11-09T12:08:41.000Z",
      "seats": [
        { "id": 102, "rowNumber": 1, "seatNumber": 2, "ticketType": "adult", "price": 12.5, "discountNote": null }
      ],
      "wheelchairSpaces": 1,
      "wheelchairDiscounts": 0,
      "totalPrice": 25,
      "screening": {
        "id": 42,
        "startsAt": "2026-11-12T15:30:00.000Z",
        "movie": { "id": 3, "title": "Dune: Part Two", "posterUrl": "https://..." },
        "theatre": { "name": "Cinema RIO Oulu", "city": "oulu" },
        "hall": { "name": "Hall 1" }
      }
    }
  ]
}
```

Rules:
- Only bookings with `user_id` = the caller's id. Guest bookings with the same e-mail are not listed.
- Included statuses: `reserved`, `paid`, `cancelled`, and `expired` only if it was a reservation (`payment_deadline IS NOT NULL`). Holds (`held`, and expired holds) are NOT listed.
- `status` follows the same rule as `GET /api/bookings/:reference`: a reservation past its `paymentDeadline` is listed as `expired` even before the expiry job runs.
- `upcoming` = screening `starts_at > now()`, sorted by `startsAt` ascending, no limit.
- `past` = screening `starts_at <= now()`, newest first, max 50.
- Item fields: `reference`, `status`, `paymentDeadline`, `paidAt`, `seats` (with `discountNote`), `wheelchairSpaces`, `wheelchairDiscounts`, `totalPrice` (same meaning as in the booking response) plus `screening`. Cancelled and expired bookings have no tickets left, so they show `seats: []`, `wheelchairSpaces: 0` and `wheelchairDiscounts: 0`.
- `city` is lowercase, like in the movies API. The movie is returned even if it is unpublished now.

### `GET /api/me/loyalty`

`requireRole('customer')`. The customer's progress toward the next loyalty discount (see "Loyalty discount — OQ-005").

Response `200`:

```json
{ "ticketsCounted": 13, "ticketsUntilDiscount": 7 }
```

- `ticketsCounted` = tickets so far, counted as in rule 4 of "Loyalty discount".
- `ticketsUntilDiscount` = `10 − (ticketsCounted mod 10)`, always 1–10. `1` means "your next ticket is discounted"; `10` means the 10th ticket from now is.
- The frontend shows it on the seat page as a hint only. The price returned by `POST /api/bookings` is the real one (another booking may change the count in between).

### Frontend notes

- The API client already sends the token on every request; staff tokens are ignored on the customer endpoints. A `401 UNAUTHORIZED` from an `optionalAuth` endpoint means the stored token is invalid or expired: delete it and ask the user to log in again.
- Logged in as a customer: the e-mail step is skipped or prefilled read-only (account e-mail).
- Checkout offers "Pay now" and "Reserve and pay later". "Reserve and pay later" is shown only to logged-in customers; a guest sees "Log in to reserve", which leads to the login and back to seat selection (a new hold is created after login — a guest hold cannot be reserved).
- "Reserve and pay later" is disabled with an explanation when less than 2 hours remain before the screening (`RESERVATION_CLOSED` is the server check).
- After reserving, show the payment deadline in Helsinki time.
- My bookings shows the deadline in Helsinki time, "Pay now" (goes to payment with `acceptNoRefund`) and "Cancel reservation" (with a confirmation dialog). "Cancel reservation" is shown only for `reserved` bookings.

### Simplifications

- No reminder e-mail before the payment deadline (FR-025 later).
- Loyalty discount: see [Loyalty discount — OQ-005](#loyalty-discount--oq-005) under "Pricing".
- No recalculation of loyalty discounts when an earlier booking is cancelled or expires.
- When an earlier booking is cancelled or expires, the count goes down, so a later ticket can get a discount on the same position again.
- An expired or cancelled booking keeps no ticket rows, so the seats it had are not shown afterwards.

---

## Authentication — FR-013 (foundation for FR-014)

Simplifications (documented in requirements section 8.1, TD-002): stateless JWT, no refresh tokens, no password reset; logout = the frontend deletes the token.

User object (the only user shape the API ever returns — never `password_hash`):

```json
{ "id": 5, "name": "Anna Virtanen", "email": "anna@example.com", "role": "customer", "theatreId": null }
```

### `POST /api/auth/register`

Request: `{ "name": "Anna Virtanen", "email": "anna@example.com", "password": "at-least-8-chars" }`
- `name` 1–100 characters, `email` valid and stored lowercase, `password` 8–72 bytes in UTF-8 (bcrypt ignores everything after 72 bytes) → otherwise `400 VALIDATION_ERROR`.
- The role is always `customer`; a `role` field in the body is ignored.
- E-mail exists → `409 EMAIL_TAKEN`.
- Password hashed with `bcryptjs`, cost 10.

Response `201`: `{ "user": { …user object… }, "token": "<jwt>" }`

### `POST /api/auth/login`

Request: `{ "email": "anna@example.com", "password": "..." }`
- Unknown e-mail, wrong password or `active = false` → `401 INVALID_CREDENTIALS` (same message for all).

Response `200`: `{ "user": { …user object… }, "token": "<jwt>" }`

### `GET /api/auth/me`

Protected (any role). Response `200`: `{ "user": { …user object… } }`. Missing or invalid token → `401 UNAUTHORIZED`.

### Token and middleware

- JWT signed with HS256 using `JWT_SECRET` (env, required; Rahti secret in production), expires after 8 hours.
- Payload: `{ "sub": <userId>, "role": "customer" | "cashier" | "admin", "theatreId": <id or null> }`.
- `requireAuth` → `401 UNAUTHORIZED` without a valid token; puts `{ id, role, theatreId }` on `req.user`.
- `requireRole(...roles)` → runs `requireAuth`, then `403 FORBIDDEN` if the role is not allowed.
- `requireAuth` checks only the token. A role change or deactivation takes effect at the next login (at most 8 hours); `GET /api/auth/me` always reads the user from the database and returns `401 UNAUTHORIZED` for an inactive user.
- Frontend stores the token in `localStorage` (simplification: vulnerable to XSS; production would use an httpOnly cookie).

---

## Admin — FR-011, FR-012, FR-013 (Sprint 3)

All endpoints under `/api/admin` require `requireRole('admin')`: no token → `401 UNAUTHORIZED`, other role → `403 FORBIDDEN`. Cashiers have no access. The admin logs in with `POST /api/auth/login`; the frontend guards `/admin/*` routes, but the server is the real check.

### Movie object (admin)

The admin sees every movie, also unpublished ones:

```json
{
  "id": 3,
  "title": "Dune: Part Two",
  "description": "…",
  "durationMinutes": 166,
  "genre": "Action, Adventure, Drama",
  "ageRating": "K-12",
  "posterUrl": "https://…",
  "trailerUrl": null,
  "published": true,
  "upcomingScreenings": 12
}
```

`upcomingScreenings` = number of screenings of the movie with `starts_at > now()` (published or not).

### Movies — FR-011

- `GET /api/admin/movies` → `200` array of movie objects, sorted by title.
- `GET /api/admin/movies/:id` → `200` movie object; unknown → `404 MOVIE_NOT_FOUND`; invalid id → `400 INVALID_ID`.
- `POST /api/admin/movies` → `201` movie object.
- `PATCH /api/admin/movies/:id` → `200` movie object. Only the fields sent are changed.
- No delete: screenings and tickets refer to movies. Hide a movie with `published: false`.
- Hiding (`published: false`) a movie that has upcoming screenings with tickets (held, reserved or paid) → `409 MOVIE_HAS_BOOKINGS`. Reservations count as tickets: the customer must still find the screening to pay. Changing other fields is allowed.

Request fields (`400 VALIDATION_ERROR` with `details.fields` when invalid):

| Field | Rule | POST |
|---|---|---|
| `title` | text, 1–200 characters after trimming | required |
| `description` | text, max 2000 characters, or `null` | optional |
| `durationMinutes` | integer 1–600 | required |
| `genre` | text, max 100 characters, or `null` | optional |
| `ageRating` | one of `S`, `K-7`, `K-12`, `K-16`, `K-18`, or `null` | optional |
| `posterUrl`, `trailerUrl` | absolute `http`/`https` URL, max 500 characters, or `null` | optional |
| `published` | boolean, default `false` | optional |

Unknown fields are ignored. `imdbId` is not editable (seed data only).

### Halls — for the screening form

- `GET /api/admin/halls` → `200`:

```json
[
  { "id": 1, "name": "Hall 1", "seats": 100, "theatre": { "id": 1, "name": "Cinema RIO Oulu", "city": "oulu" } }
]
```

Sorted by theatre name, then hall name. `seats` = number of seats of type `normal` + `owner`. Halls are read-only in Sprint 3 (hall editing is FR-027, Should).

### Screening object (admin)

```json
{
  "id": 42,
  "startsAt": "2026-11-20T15:30:00.000Z",
  "endsAt": "2026-11-20T18:16:00.000Z",
  "basePrice": 12.5,
  "isPremiere": false,
  "published": true,
  "movie": { "id": 3, "title": "Dune: Part Two", "durationMinutes": 166, "published": true },
  "hall": { "id": 1, "name": "Hall 1" },
  "theatre": { "id": 1, "name": "Cinema RIO Oulu", "city": "oulu" },
  "ticketsSold": 14,
  "ticketsHeld": 2,
  "ticketsReserved": 4
}
```

- `endsAt` = `startsAt` + movie duration (computed, not stored).
- `ticketsSold` = tickets of bookings with status `paid`; `ticketsHeld` = tickets of valid holds; `ticketsReserved` = tickets of reservations with `payment_deadline > now()`. Seat 1 (owner) is never counted.

### Screenings — FR-012

- `GET /api/admin/screenings?from=2026-11-16&to=2026-11-30&theatreId=1`
  - `from` / `to`: dates `YYYY-MM-DD` in Helsinki time, both included; default `from` = today, `to` = `from` + 13 days; max 62 days → otherwise `400 VALIDATION_ERROR`.
  - `theatreId`: optional positive integer.
  - Returns published AND unpublished screenings, sorted by `startsAt`.
- `GET /api/admin/screenings/:id` → `200` screening object; unknown → `404 SCREENING_NOT_FOUND`.
- `POST /api/admin/screenings` → `201` screening object.
- `PATCH /api/admin/screenings/:id` → `200` screening object. Only the fields sent are changed.
- `DELETE /api/admin/screenings/:id` → `204`. Allowed only when the screening has no tickets, i.e. nobody has paid, nobody is holding seats right now and there is no open reservation → otherwise `409 SCREENING_HAS_BOOKINGS`.
  - In ONE transaction: delete the screening's old bookings without tickets (status `expired` or `cancelled`), then the screening. The database foreign keys would otherwise refuse the delete. Customers' cancelled and expired reservations of this screening disappear from "My bookings" with it.
  - A seat held in checkout blocks the delete until the hold is paid or expires (max 15 minutes). A reservation blocks it until it is paid, cancelled or its deadline passes (can be days).
  - Open question for the customer (OQ-019): what should happen when the owner must cancel a screening that already has paid tickets? Until answered, such a screening cannot be changed, hidden or deleted (BR-008: no refunds).

Request fields:

| Field | Rule | POST |
|---|---|---|
| `movieId` | existing movie id | required |
| `hallId` | existing hall id | required |
| `startsAt` | ISO 8601 with time zone (`Z` or `+02:00`); a time without a zone → `400`. Must be in the future. | required |
| `basePrice` | number 0–100 with at most 2 decimals | required |
| `isPremiere` | boolean, default `false` (OQ-003: set by the admin, never inferred) | optional |
| `published` | boolean, default `false` | optional |

Rules (after validation):
1. Unknown `movieId` → `404 MOVIE_NOT_FOUND`; unknown `hallId` → `404 NOT_FOUND`.
2. **Price before publishing (BR-009):** the result would be `published: true` with `basePrice` 0 → `400 VALIDATION_ERROR`, `details.fields.basePrice` = `"Set a price greater than 0 € before publishing"`. (The database also refuses it with the `published_needs_price` constraint.)
3. **Movie must be published:** the result would be `published: true` but the movie is not published → `409 MOVIE_NOT_PUBLISHED`.
4. **No overlap in one hall:** a hall is busy from the start of the ads (`startsAt` − 12 minutes, BR-015) until the movie ends (`startsAt` + duration). If this interval overlaps any other screening in the same hall (published or not) → `409 SCREENING_OVERLAP` with `details.screeningIds`. Check it in SQL with `tstzrange(…) && tstzrange(…)`; on PATCH ignore the screening itself.
5. **Bookings lock the screening:** if the screening has any tickets (held, reserved or paid), it cannot be changed at all — any PATCH, including `published: false` → `409 SCREENING_HAS_BOOKINGS`. Customers who bought a ticket must still find their screening.
- The admin form shows times in Helsinki time; the frontend converts them to ISO with the zone offset before sending.
- Simplification: two admins saving overlapping screenings at the exact same moment are not handled (one owner). Production would add a database exclusion constraint.
