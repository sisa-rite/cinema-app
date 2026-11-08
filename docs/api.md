# API — Rio Theatres

Version 2 (Sprint 2, agreed on 9 Nov 2026). This file is the contract between frontend and backend.
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

`details` is optional and only present where this document says so.

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
- Only published screenings → otherwise `404 SCREENING_NOT_FOUND`. A screening that has started is still returned (the frontend shows "sales closed").
- `seats` contains every seat of the hall, sorted by `posY`, then `posX`.
- `posX` = column from the left of the map (1…seatsPerRow), `posY` = physical row from the screen (1 = nearest). The map is drawn with the screen at the bottom.
- `state`:
  - `owner` — seat type `owner` (seat 1), never bookable
  - `blocked` — seat type `blocked`, never bookable
  - `sold` — has a ticket in a booking with status `paid` or `reserved`
  - `held` — has a ticket in a booking with status `held` and `hold_expires_at > now()`
  - `available` — everything else. A hold that has expired counts as available even if the expiry job has not run yet.
- `city` is lowercase (`oulu` / `tampere`), like in the movies API.

---

## Bookings — FR-005, FR-006, FR-008

### `POST /api/bookings`

Public (guest checkout). Holds seats for 15 minutes.

Request:

```json
{ "screeningId": 42, "seatIds": [102, 104], "email": "guest@example.com" }
```

Validation (`400 VALIDATION_ERROR`, `details.fields`):
- `screeningId`: positive integer.
- `seatIds`: array of 1–10 unique positive integers (BR-005).
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
    { "id": 102, "rowNumber": 1, "seatNumber": 2 },
    { "id": 104, "rowNumber": 1, "seatNumber": 4 }
  ],
  "totalPrice": 25
}
```

Rules:
- Screening not found or not published → `404 SCREENING_NOT_FOUND`.
- `starts_at <= now()` → `409 SALES_CLOSED`.
- Any seat not in the screening's hall, of type `owner` / `blocked`, or already held/sold → `409 SEATS_UNAVAILABLE` with `details.seatIds`. Nothing is saved.
- Everything runs in ONE transaction: delete tickets of expired holds for this screening, insert the booking, insert one ticket per seat. The unique constraint on `tickets (screening_id, seat_id)` decides who wins when two requests come at the same time; the loser gets `409 SEATS_UNAVAILABLE`.
- `holdExpiresAt` = now + 15 minutes, set by the server.
- `reference` = `RIO-` + 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I), unique; generated by the server.
- Price in Sprint 2: `basePrice` per seat, ticket type `adult`. Pricing rules (child, premiere, 10th ticket) are FR-021 (Should).

### `GET /api/bookings/:reference?email=guest@example.com`

Public. Used to show the hold countdown after a page reload and later for payment.
- `email` must match the booking's e-mail (case-insensitive) → otherwise `404 BOOKING_NOT_FOUND` (do not reveal that the reference exists).
- Response `200`: same shape as `POST /api/bookings`. An expired hold returns `status: "expired"`.

### Expiry (background job, no endpoint)

Every minute: bookings with `status = 'held'` and `hold_expires_at <= now()` → `status = 'expired'`, their tickets are deleted.

---

## Authentication — FR-013 (foundation for FR-014)

Simplifications (documented in requirements section 8.1, TD-002): stateless JWT, no refresh tokens, no password reset; logout = the frontend deletes the token.

User object (the only user shape the API ever returns — never `password_hash`):

```json
{ "id": 5, "name": "Anna Virtanen", "email": "anna@example.com", "role": "customer", "theatreId": null }
```

### `POST /api/auth/register`

Request: `{ "name": "Anna Virtanen", "email": "anna@example.com", "password": "at-least-8-chars" }`
- `name` 1–100 characters, `email` valid and stored lowercase, `password` 8–72 characters → otherwise `400 VALIDATION_ERROR`.
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
- Frontend stores the token in `localStorage` (simplification: vulnerable to XSS; production would use an httpOnly cookie).
