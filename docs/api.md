# API — Rio Theatres

Version 3 (Sprint 3, 16 Nov 2026). This file is the contract between frontend and backend.
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
| 409 | `HOLD_EXPIRED` | Payment for a booking whose 15-minute hold has expired |
| 409 | `MOVIE_NOT_PUBLISHED` | Publishing a screening of an unpublished movie |
| 409 | `SCREENING_OVERLAP` | The hall is already used at that time; `details.screeningIds` lists the conflicting screenings |
| 409 | `SCREENING_HAS_BOOKINGS` | Changing or deleting a screening that already has tickets |
| 409 | `MOVIE_HAS_BOOKINGS` | Hiding a movie that has upcoming screenings with tickets |
| 500 | `INTERNAL_ERROR` | Unexpected error; details only in the server log |

---

## Movies (done in Sprint 1)

- `GET /api/movies?city=oulu|tampere` — movies with upcoming published screenings in the city.
- `GET /api/movies/:id?city=oulu|tampere` — one movie with its upcoming screenings in the city.

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
  - `sold` — has a ticket in a booking with status `paid`, or `reserved` (Release 2) with `payment_deadline > now()`
  - `held` — has a ticket in a booking with status `held` and `hold_expires_at > now()`
  - `available` — everything else. A hold that has expired counts as available even if the expiry job has not run yet.
- `city` is lowercase (`oulu` / `tampere`), like in the movies API.
- `prices` = the price of one ticket of each type after the pricing rules (FR-021, see "Pricing" below). The frontend shows them; the server computes the real total again on booking.
- `childMaxAge` = the oldest age that still gets a child ticket (0–12, BR-012).
- `wheelchairSpaces` (FR-023, BR-014): `total` = `halls.wheelchair_spaces`, `available` = `total` minus wheelchair tickets in active bookings (same rule as `held` / `sold` above). The spaces are in front of row 1 and have no seat numbers.

---

## Bookings — FR-005, FR-006, FR-008

### `POST /api/bookings`

Public (guest checkout). Holds seats for 15 minutes.

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
- `email`: required, valid e-mail format, max 254 characters, stored lowercase.

Response `201`:

```json
{
  "id": 17,
  "reference": "RIO-7K3QX9",
  "status": "held",
  "screeningId": 42,
  "email": "guest@example.com",
  "holdExpiresAt": "2026-11-09T12:15:00.000Z",
  "seats": [
    { "id": 102, "rowNumber": 1, "seatNumber": 2, "ticketType": "adult", "price": 12.5 },
    { "id": 104, "rowNumber": 1, "seatNumber": 4, "ticketType": "child", "price": 6.25 }
  ],
  "wheelchairSpaces": 1,
  "totalPrice": 31.25
}
```

Rules:
- Screening not found or not published → `404 SCREENING_NOT_FOUND`. A screening of an unpublished movie counts as not published → `404 SCREENING_NOT_FOUND`.
- `starts_at <= now()` → `409 SALES_CLOSED`.
- Any seat not in the screening's hall, of type `owner` / `blocked`, or already held/sold → `409 SEATS_UNAVAILABLE` with `details.seatIds`. Nothing is saved.
- Everything runs in ONE transaction: mark expired holds of this screening as `expired` and delete their tickets, insert the booking, insert one ticket per seat.
- The unique constraint on `tickets (screening_id, seat_id)` decides who wins when two requests come at the same time. On a unique violation (PostgreSQL error code `23505`) the backend rolls back, reads which of the requested seats are now taken and returns `409 SEATS_UNAVAILABLE` with those `details.seatIds`.
- `holdExpiresAt` = now + 15 minutes, set by the server.
- `reference` = `RIO-` + 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I), generated by the server with `crypto.randomInt`. If it collides with an existing reference (unique constraint), generate a new one and retry (max 3 times).
- Wheelchair spaces: one ticket per space with `seat_id = NULL`, `is_wheelchair = true`, ticket type `adult`. When `wheelchairSpaces` > 0 the transaction first locks the screening row (`SELECT … FOR UPDATE`), because no unique index protects seatless tickets. More than `available` → `409 WHEELCHAIR_SPACES_UNAVAILABLE` with `details.available`. Nothing is saved.
- `totalPrice` = the sum of the ticket prices (see "Pricing").

### Pricing — FR-021 (BR-012)

- Premiere: +15 % on `basePrice`, applied first. Child ticket (age 0–12): −50 % of that. Rounded to 0.01 € once, after the final calculation. Example: base 10 € premiere → adult 11.50 €, child 5.75 €.
- Wheelchair spaces cost an adult ticket (BR-014: no special pricing).
- The every-10th-ticket discount needs a registered user (Release 2), so guest checkout never applies it.

### `GET /api/bookings/:reference?email=guest@example.com`

Public. Used to show the hold countdown after a page reload and later for payment.
- `email` must match the booking's e-mail (case-insensitive) → otherwise `404 BOOKING_NOT_FOUND` (do not reveal that the reference exists).
- Response `200`: same shape as `POST /api/bookings`, plus `paidAt` (ISO string, or `null` when not paid). A hold whose `holdExpiresAt` has passed is returned with `status: "expired"`, even if the expiry job has not updated it yet.
- Possible `status` values in Sprint 3: `held`, `expired`, `paid`. The checkout page shows the confirmation for `paid` and "Your hold has expired" only for `expired`.
- Simplification: the e-mail is sent in the query string, so it can appear in server logs. Production would use a separate secret token instead.

### Expiry (background job, no endpoint)

Every minute: bookings with `status = 'held'` and `hold_expires_at <= now()` → `status = 'expired'`, their tickets are deleted.

---

## Payment — FR-007, FR-009 (Sprint 3)

### `POST /api/bookings/:reference/pay`

Public (guest checkout). Simulated online payment: no card data is entered, sent or stored (CAD-002).

Request:

```json
{ "email": "guest@example.com", "acceptNoRefund": true }
```

Validation (`400 VALIDATION_ERROR`, `details.fields`):
- `email`: required, valid e-mail format (compared lowercase).
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
  "paidAt": "2026-11-09T12:08:41.000Z",
  "seats": [
    { "id": 102, "rowNumber": 1, "seatNumber": 2, "ticketType": "adult", "price": 12.5 },
    { "id": 104, "rowNumber": 1, "seatNumber": 4, "ticketType": "adult", "price": 12.5 }
  ],
  "wheelchairSpaces": 0,
  "totalPrice": 25
}
```

Rules (checked in this order, inside ONE transaction):
1. Load the booking with `SELECT … FOR UPDATE` by reference and e-mail. Not found or e-mail does not match → `404 BOOKING_NOT_FOUND`.
2. Already `paid` → return `200` with the paid booking again and do NOT create a second payment. The frontend disables the button after the first click ("Pay" → "Paying…"); this server rule is the safety net for two tabs or a network retry.
3. `status` is not `held`, or `hold_expires_at <= now()` → `409 HOLD_EXPIRED`.
4. The screening has started (`starts_at <= now()`) → `409 SALES_CLOSED`.
5. `UPDATE bookings SET status = 'paid'`, then `INSERT INTO payments (booking_id, method, amount, paid_at) VALUES (…, 'online', total_price, now())`. The amount always comes from the database, never from the request.
- `FOR UPDATE` makes the payment and the expiry job wait for each other: a hold is either paid or expired, never both.
- `paidAt` = `payments.paid_at` of the booking's payment.
- Simplification: anyone who knows the reference and the e-mail can pay. A real system would use a payment provider (Stripe Checkout) with webhooks and receipts.

### Customer-side rules without a new endpoint

- **FR-009 No-refund notice:** shown on the checkout page; the "Pay" button stays disabled until the customer ticks the confirmation. The server enforces it with `acceptNoRefund`.
- **FR-010 Age rating warning:** uses `screening.movie.ageRating` from `GET /api/screenings/:id/seats`. Every rating except `S` and `null` (i.e. `K-7`, `K-12`, `K-16`, `K-18`) shows the ID-check pop-up when the customer has selected seats and clicks "Continue", before the e-mail step; the pop-up names the rating. The customer must confirm it to continue. No server check — it is information, not a sales block (BR-011). Ticket types are not restricted by the rating.

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
- Hiding (`published: false`) a movie that has upcoming screenings with tickets → `409 MOVIE_HAS_BOOKINGS`. Changing other fields is allowed.

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
  "ticketsHeld": 2
}
```

- `endsAt` = `startsAt` + movie duration (computed, not stored).
- `ticketsSold` = tickets of bookings with status `paid`; `ticketsHeld` = tickets of valid holds. Seat 1 (owner) is never counted.

### Screenings — FR-012

- `GET /api/admin/screenings?from=2026-11-16&to=2026-11-30&theatreId=1`
  - `from` / `to`: dates `YYYY-MM-DD` in Helsinki time, both included; default `from` = today, `to` = `from` + 13 days; max 62 days → otherwise `400 VALIDATION_ERROR`.
  - `theatreId`: optional positive integer.
  - Returns published AND unpublished screenings, sorted by `startsAt`.
- `GET /api/admin/screenings/:id` → `200` screening object; unknown → `404 SCREENING_NOT_FOUND`.
- `POST /api/admin/screenings` → `201` screening object.
- `PATCH /api/admin/screenings/:id` → `200` screening object. Only the fields sent are changed.
- `DELETE /api/admin/screenings/:id` → `204`. Allowed only when the screening has no tickets, i.e. nobody has paid and nobody is holding seats right now → otherwise `409 SCREENING_HAS_BOOKINGS`.
  - In ONE transaction: delete the screening's old bookings without tickets (status `expired`), then the screening. The database foreign keys would otherwise refuse the delete.
  - A seat held in checkout blocks the delete until the hold is paid or expires (max 15 minutes).
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
