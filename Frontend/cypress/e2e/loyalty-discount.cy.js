// Loyalty discount, every 10th ticket −50 % (OQ-005). Runs against the real backend and database.
import { requiresAgeCheck } from "../../src/utils/ageRating.js";
import { formatPrice } from "../../src/utils/format.js";
import { PASSWORD, uniqueEmail } from "../support/customerAccount.js";

const MOVIE_LINKS = 'a[href^="/movies/"]';
const AVAILABLE_SEATS = '[data-testid="seat-map"] button[aria-label$=", available"]';
const HOUR = 60 * 60 * 1000;
const NEXT_TICKET_HINT = "Your next ticket is 50 % off";
const IN_ORDER_HINT = "One ticket in this order gets 50 % off (every 10th ticket).";

// In development React fetches twice and aborts the first request, so cy.wait() on an
// alias can yield a request without a response. Call this once the UI shows the data.
function lastResponse(alias) {
  return cy.get(`${alias}.all`).then((interceptions) => {
    const answered = interceptions.filter((interception) => interception.response);
    return answered[answered.length - 1];
  });
}

// The first Oulu screening more than 3 hours away, so the 10th ticket can still be reserved
// (reservations close 2 hours before the start). The movie request also gives the API origin.
function findScreening() {
  cy.intercept("GET", "**/api/movies/*", (req) => {
    delete req.headers["if-none-match"];
  }).as("movie");
  cy.visit("/movies?city=oulu");
  cy.get(MOVIE_LINKS).first().click();
  cy.get('a[href^="/screenings/"]').should("exist");
  return lastResponse("@movie").then(({ request, response }) => {
    const screening = response.body.screenings.find(
      ({ startsAt }) => Date.parse(startsAt) > Date.now() + 3 * HOUR,
    );
    expect(screening, "an Oulu screening more than 3 hours away").to.exist;
    return { id: screening.id, apiOrigin: new URL(request.url).origin };
  });
}

// A new customer with 9 counted tickets in two bookings. Holds count like paid tickets
// (rule 4) and are cancelled after the test, so reruns do not fill the hall.
function customerWithNineTickets(apiOrigin, screeningId) {
  return cy
    .request("POST", `${apiOrigin}/api/auth/register`, {
      name: "Loyal Customer",
      email: uniqueEmail(),
      password: PASSWORD,
    })
    .its("body.token")
    .then((token) =>
      cy.request(`${apiOrigin}/api/screenings/${screeningId}/seats`).then(({ body }) => {
        const free = body.seats.filter((seat) => seat.state === "available").map((seat) => seat.id);
        // Taken from the end, so the UI's first available seat stays free for the 10th ticket.
        const seatIds = free.slice(-9);
        expect(seatIds, "9 free seats").to.have.length(9);
        const headers = { Authorization: `Bearer ${token}` };
        const references = [];
        for (const ids of [seatIds.slice(0, 5), seatIds.slice(5)]) {
          cy.request({
            method: "POST",
            url: `${apiOrigin}/api/bookings`,
            headers,
            body: { screeningId, seatIds: ids },
          }).then(({ body: booking }) => references.push(booking.reference));
        }
        return cy.wrap({ token, references });
      }),
    );
}

function cancelBookings(apiOrigin, token, references) {
  for (const reference of references) {
    cy.request({
      method: "POST",
      url: `${apiOrigin}/api/bookings/${reference}/cancel`,
      headers: { Authorization: `Bearer ${token}` },
      body: {},
    });
  }
}

function visitSeats(screeningId, token = null) {
  cy.intercept("GET", "**/api/screenings/*/seats", (req) => {
    delete req.headers["if-none-match"];
  }).as("seats");
  cy.visit(`/screenings/${screeningId}`, {
    onBeforeLoad(win) {
      if (token) win.localStorage.setItem("rio-token", token);
    },
  });
}

// Continues from the seat page with the selected seats and holds them; yields the hold response.
function continueAndHold(guestEmail = null) {
  cy.intercept("POST", "**/api/bookings").as("hold");
  cy.contains("button", "Continue").click();
  // The real age rating (FR-010 has its own spec): confirm the ID-check warning if shown.
  lastResponse("@seats").its("response.body.screening.movie.ageRating").then((ageRating) => {
    if (requiresAgeCheck(ageRating)) cy.contains("button", "I understand, continue").click();
  });
  if (guestEmail) cy.get("#booking-email").type(guestEmail);
  cy.contains("button", "Hold my seats").click();
  cy.location("pathname").should("match", /^\/checkout\/RIO-/);
  return cy.wait("@hold").its("response.body");
}

describe("Loyalty discount", () => {
  it("tells a customer with 9 tickets that the next ticket is 50 % off", () => {
    findScreening().then(({ id, apiOrigin }) => {
      customerWithNineTickets(apiOrigin, id).then(({ token, references }) => {
        visitSeats(id, token);
        cy.get('[data-testid="loyalty-hint"]').should("have.text", NEXT_TICKET_HINT);

        cancelBookings(apiOrigin, token, references);
      });
    });
  });

  it("gives the 10th ticket the discount in checkout and My bookings", () => {
    findScreening().then(({ id, apiOrigin }) => {
      customerWithNineTickets(apiOrigin, id).then(({ token, references }) => {
        visitSeats(id, token);
        cy.get('[data-testid="loyalty-hint"]').should("have.text", NEXT_TICKET_HINT);
        // A new seat is an adult ticket, so the discount position can be used.
        cy.get(AVAILABLE_SEATS).first().click();
        cy.get('[data-testid="loyalty-hint"]').should("contain", IN_ORDER_HINT);

        continueAndHold().then((booking) => {
          const discounted = booking.seats.filter((seat) => seat.discountNote);
          expect(discounted, "one discounted seat").to.have.length(1);

          cy.get('[data-testid="discount-badge"]')
            .should("have.length", 1)
            .and("have.text", discounted[0].discountNote);
          cy.contains("p", "Total").should("contain", formatPrice(booking.totalPrice));

          cy.intercept("POST", "**/api/bookings/*/reserve").as("reserve");
          cy.contains("button", "Reserve and pay later").click();
          cy.wait("@reserve").its("response.statusCode").should("eq", 200);

          cy.visit("/my-bookings");
          cy.contains('[data-testid="booking-card"]', booking.reference).within(() => {
            cy.get('[data-testid="discount-badge"]').should("have.text", discounted[0].discountNote);
            // formatPrice uses a no-break space, which cy.contains() does not match in its argument.
            cy.contains("dt", "Total").next().should("have.text", formatPrice(booking.totalPrice));
          });

          cancelBookings(apiOrigin, token, [...references, booking.reference]);
        });
      });
    });
  });

  it("shows a guest no hint and no badge", () => {
    cy.intercept("GET", "**/api/me/loyalty").as("loyalty");
    findScreening().then(({ id }) => {
      visitSeats(id);
      cy.get(AVAILABLE_SEATS).first().click();
      cy.get('[data-testid="loyalty-hint"]').should("not.exist");
      continueAndHold(uniqueEmail());
      cy.get('[data-testid="discount-badge"]').should("not.exist");
      cy.get("@loyalty.all").should("have.length", 0);
    });
  });
});
