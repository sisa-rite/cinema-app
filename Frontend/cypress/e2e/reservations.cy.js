// Reserve and pay later, cancel (FR-015, FR-016, FR-018). Runs against the real backend and
// database; only two states that cannot be created from the browser are stubbed (see below).
import { requiresAgeCheck } from "../../src/utils/ageRating.js";
import { formatDayLabel, formatTime } from "../../src/utils/format.js";
import { signUp, uniqueEmail } from "../support/customerAccount.js";

const MOVIE_LINKS = 'a[href^="/movies/"]';
const AVAILABLE_SEATS = '[data-testid="seat-map"] button[aria-label$=", available"]';
const HOUR = 60 * 60 * 1000;

// In development React fetches twice and aborts the first request, so cy.wait() on an
// alias can yield a request without a response. Call this once the UI shows the data.
function lastResponse(alias) {
  return cy.get(`${alias}.all`).then((interceptions) => {
    const answered = interceptions.filter((interception) => interception.response);
    return answered[answered.length - 1];
  });
}

function deadlineFor(startsAt) {
  return new Date(Date.parse(startsAt) - 2 * HOUR).toISOString();
}

function formatDeadline(iso) {
  return `${formatDayLabel(iso)}, ${formatTime(iso)}`;
}

// The first Oulu screening that starts more than 3 hours from now, so the server still
// accepts reservations (they close 2 hours before the start). Read from the movie response
// the app loads anyway; its URL also gives the API origin for cleaning up.
function findReservableScreening() {
  cy.intercept("GET", "**/api/movies/*", (req) => {
    // Without this the browser may revalidate and get an empty 304 instead of the movie.
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
    return { id: screening.id, startsAt: screening.startsAt, apiOrigin: new URL(request.url).origin };
  });
}

// Holds the first available seat (or the given one) through the UI; yields the real hold
// and the seat's label, e.g. "Row 9, seat 91".
function holdSeat(screeningId, { seat, guestEmail } = {}) {
  cy.intercept("GET", "**/api/screenings/*/seats", (req) => {
    delete req.headers["if-none-match"];
  }).as("seats");
  cy.intercept("POST", "**/api/bookings").as("hold");
  cy.visit(`/screenings/${screeningId}`);

  const seatButton = seat
    ? cy.get(`[data-testid="seat-map"] button[aria-label="${seat}, available"]`)
    : cy.get(AVAILABLE_SEATS).first();
  return seatButton.invoke("attr", "aria-label").then((label) => {
    const seatLabel = label.replace(/, available$/, "");
    cy.get(`[aria-label="${label}"]`).click();
    cy.contains("button", "Continue").click();
    // The real age rating (FR-010 has its own spec): confirm the ID-check warning if shown.
    lastResponse("@seats").its("response.body.screening.movie.ageRating").then((ageRating) => {
      if (requiresAgeCheck(ageRating)) cy.contains("button", "I understand, continue").click();
    });
    // A customer's e-mail field disappears once the account is loaded.
    if (guestEmail) cy.get("#booking-email").type(guestEmail);
    else cy.get("#booking-email").should("not.exist");
    cy.contains("button", "Hold my seats").click();
    cy.location("pathname").should("match", /^\/checkout\/RIO-/);
    return cy.wait("@hold").then(({ response }) => ({ hold: response.body, seatLabel }));
  });
}

function signUpAndReserve(name, screeningId) {
  signUp(name, uniqueEmail());
  cy.location("pathname").should("eq", "/my-bookings");
  return holdSeat(screeningId).then((held) => {
    cy.intercept("POST", "**/api/bookings/*/reserve").as("reserve");
    cy.contains("button", "Reserve and pay later").click();
    cy.wait("@reserve").its("response.statusCode").should("eq", 200);
    cy.contains("h1", "Reservation confirmed");
    return cy.wrap(held);
  });
}

function bookingCard(reference) {
  return cy.contains('[data-testid="booking-card"]', reference);
}

function authHeader(win) {
  return { Authorization: `Bearer ${win.localStorage.getItem("rio-token")}` };
}

// Test cleanup: a reservation keeps its seat until the deadline, days away, so reruns would
// otherwise fill the hall. Uses the logged-in customer's token.
function cancelLeftoverReservation(apiOrigin, reference) {
  cy.window().then((win) =>
    cy.request({
      method: "POST",
      url: `${apiOrigin}/api/bookings/${reference}/cancel`,
      headers: authHeader(win),
      body: {},
    }),
  );
}

// Stays on purpose: a screening starting in less than 2 hours cannot be created from the
// browser, so the start in the seats response is moved. Reserve is never sent in that test.
function stubScreeningStartingSoon() {
  cy.intercept("GET", "**/api/screenings/*/seats", (req) => {
    delete req.headers["if-none-match"];
    req.on("before:response", (res) => {
      res.body.screening.startsAt = new Date(Date.now() + 1.5 * HOUR).toISOString();
    });
  });
}

// Stays on purpose: the payment deadline cannot be moved from Cypress, so the server's
// answer to paying a reservation after it is stubbed.
function stubExpiredReservationPayment(reference) {
  cy.intercept("POST", `**/api/bookings/${reference}/pay`, {
    statusCode: 409,
    body: {
      error: {
        code: "RESERVATION_EXPIRED",
        message: "The reservation payment deadline has passed.",
      },
    },
  }).as("expiredPay");
}

describe("Reservations", () => {
  it("reserves held seats without the no-refund confirmation and lists them as Reserved", () => {
    cy.viewport(375, 812);
    findReservableScreening().then(({ id, startsAt, apiOrigin }) => {
      const deadline = deadlineFor(startsAt);
      signUp("Reserving Customer", uniqueEmail());
      cy.location("pathname").should("eq", "/my-bookings");

      holdSeat(id).then(({ hold }) => {
        cy.get('[data-testid="reserve-hint"]').should(
          "have.text",
          `Pay at the latest 2 hours before the screening (by ${formatDeadline(deadline)}).`,
        );
        cy.contains("button", /^Pay$/).should("be.disabled");
        cy.intercept("POST", "**/api/bookings/*/reserve").as("reserve");
        cy.contains("button", "Reserve and pay later").should("be.enabled").click();
        cy.wait("@reserve").its("response.body.paymentDeadline").should("eq", deadline);

        cy.get('[data-testid="reservation-confirmation"]').within(() => {
          cy.contains("h1", "Reservation confirmed").should("be.focused");
          cy.get('[data-testid="payment-deadline"]')
            .should("have.text", formatDeadline(deadline))
            .and("have.attr", "datetime", deadline);
          cy.get('[data-testid="booking-reference"]').should("have.text", hold.reference);
        });
        cy.document().its("documentElement.scrollWidth").should("be.lte", 375);

        cy.contains("a", "Go to My bookings").click();
        bookingCard(hold.reference).within(() => {
          cy.get('[data-testid="booking-status"]').should("have.text", "Reserved");
          cy.contains("Pay by");
          cy.contains("a", "Pay now");
          cy.contains("button", "Cancel reservation");
        });
        cy.document().its("documentElement.scrollWidth").should("be.lte", 375);

        cancelLeftoverReservation(apiOrigin, hold.reference);
      });
    });
  });

  it("pays a reservation from My bookings", () => {
    findReservableScreening().then(({ id }) => {
      signUpAndReserve("Settling Customer", id).then(({ hold }) => {
        cy.contains("a", "Go to My bookings").click();
        bookingCard(hold.reference).contains("a", "Pay now").click();

        cy.location("pathname").should("eq", `/checkout/${hold.reference}`);
        cy.contains("h1", "Reservation confirmed");
        cy.intercept("POST", `**/api/bookings/${hold.reference}/pay`).as("pay");
        cy.contains("button", /^Pay$/).should("be.disabled");
        cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
        cy.contains("button", /^Pay$/).should("be.enabled").click();
        cy.wait("@pay").its("response.statusCode").should("eq", 200);

        cy.get('[data-testid="booking-confirmation"]').within(() => {
          cy.contains("h1", "Your tickets are confirmed");
          cy.get('[data-testid="booking-reference"]').should("have.text", hold.reference);
        });

        cy.visit("/my-bookings");
        bookingCard(hold.reference).within(() => {
          cy.get('[data-testid="booking-status"]').should("have.text", "Paid");
          cy.contains("a", "View confirmation");
          cy.contains("button", "Cancel reservation").should("not.exist");
        });
      });
    });
  });

  it("cancels a reservation from My bookings and frees the seat", () => {
    findReservableScreening().then(({ id }) => {
      signUpAndReserve("Cancelling Customer", id).then(({ hold, seatLabel }) => {
        cy.intercept("POST", "**/api/bookings/*/cancel").as("cancel");
        cy.contains("a", "Go to My bookings").click();
        bookingCard(hold.reference).contains("button", "Cancel reservation").click();

        cy.get('[data-testid="cancel-reservation-dialog"]')
          .should("be.visible")
          .within(() => {
            cy.contains("h2", "Cancel this reservation?");
            cy.contains("The seats will be released.");
            cy.contains("button", "Keep it").should("be.focused").click();
          });
        cy.get('[data-testid="cancel-reservation-dialog"]').should("not.be.visible");
        cy.get("@cancel.all").should("have.length", 0);
        bookingCard(hold.reference)
          .find('[data-testid="booking-status"]')
          .should("have.text", "Reserved");

        // "Keep it" and an immediate second click, before the dialog's asynchronous close
        // event arrives, must still reopen it.
        bookingCard(hold.reference).contains("button", "Cancel reservation").as("openDialog").click();
        cy.get('[data-testid="cancel-reservation-dialog"]')
          .contains("button", "Keep it")
          .then(($keep) => {
            cy.get("@openDialog").then(($open) => {
              $keep[0].click();
              $open[0].click();
            });
          });
        cy.get('[data-testid="cancel-reservation-dialog"]').should("be.visible");
        cy.get('[data-testid="cancel-reservation-dialog"]').contains("button", "Keep it").click();
        cy.get("@cancel.all").should("have.length", 0);

        bookingCard(hold.reference).contains("button", "Cancel reservation").click();
        cy.get('[data-testid="cancel-reservation-dialog"]')
          .contains("button", "Cancel reservation")
          .click();
        cy.wait("@cancel").its("response.body").should((cancelled) => {
          expect(cancelled.status).to.eq("cancelled");
          expect(cancelled.seats).to.deep.eq([]);
        });

        bookingCard(hold.reference).within(() => {
          cy.get('[data-testid="booking-status"]').should("have.text", "Cancelled");
          cy.contains('[role="status"]', "Reservation cancelled.").should("be.focused");
          cy.contains("button", "Cancel reservation").should("not.exist");
          cy.contains("a", "Pay now").should("not.exist");
        });

        // It stays in place until the next load, then moves to its own section.
        cy.reload();
        cy.get('section[aria-labelledby="cancelled-bookings"]').within(() => {
          cy.contains("h2", "Cancelled");
          bookingCard(hold.reference)
            .find('[data-testid="booking-status"]')
            .should("have.text", "Cancelled");
        });
        cy.get('section[aria-labelledby="upcoming-bookings"]').should("not.contain", hold.reference);

        // The released seat can be held again right away.
        holdSeat(id, { seat: seatLabel }).its("seatLabel").should("eq", seatLabel);
      });
    });
  });

  it("disables reserving less than 2 hours before the screening", () => {
    findReservableScreening().then(({ id }) => {
      signUp("Late Customer", uniqueEmail());
      cy.location("pathname").should("eq", "/my-bookings");
      stubScreeningStartingSoon();
      holdSeat(id).then(() => {
        cy.contains("button", "Reserve and pay later").should("be.disabled");
        cy.get('[data-testid="reserve-hint"]').should(
          "have.text",
          "Reservations close 2 hours before the screening.",
        );
        cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
        cy.contains("button", /^Pay$/).should("be.enabled");
      });
    });
  });

  it("shows the expired view when the payment deadline has passed", () => {
    findReservableScreening().then(({ id, apiOrigin }) => {
      signUpAndReserve("Expiring Customer", id).then(({ hold }) => {
        stubExpiredReservationPayment(hold.reference);
        cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
        cy.contains("button", /^Pay$/).click();
        cy.wait("@expiredPay");

        cy.contains("h1", "Reservation expired").should("be.focused");
        cy.contains('[role="status"]', "The payment deadline has passed. Your reservation has expired.");
        cy.contains("a", "Go to My bookings").should("have.attr", "href", "/my-bookings");

        cancelLeftoverReservation(apiOrigin, hold.reference);
      });
    });
  });

  it("shows the confirmation when a reservation paid elsewhere is cancelled", () => {
    findReservableScreening().then(({ id, apiOrigin }) => {
      signUpAndReserve("Two Tab Customer", id).then(({ hold }) => {
        // Paid in another tab while this page still shows the reservation.
        cy.window().then((win) =>
          cy.request({
            method: "POST",
            url: `${apiOrigin}/api/bookings/${hold.reference}/pay`,
            headers: authHeader(win),
            body: { acceptNoRefund: true },
          }),
        );

        cy.intercept("POST", "**/api/bookings/*/cancel").as("cancel");
        cy.contains("button", "Cancel reservation").click();
        cy.get('[data-testid="cancel-reservation-dialog"]')
          .contains("button", "Cancel reservation")
          .click();
        cy.wait("@cancel").its("response.body.error").should("deep.include", {
          code: "BOOKING_NOT_CANCELLABLE",
          details: { status: "paid" },
        });

        cy.get('[data-testid="booking-confirmation"]').within(() => {
          cy.contains("h1", "Your tickets are confirmed");
          cy.get('[data-testid="booking-reference"]').should("have.text", hold.reference);
        });
      });
    });
  });

  it("asks a guest to log in to reserve", () => {
    findReservableScreening().then(({ id }) => {
      holdSeat(id, { guestEmail: uniqueEmail() }).then(({ hold }) => {
        cy.contains("button", "Reserve and pay later").should("not.exist");
        cy.contains("p", "Want to pay later?")
          .contains("a", "Log in to reserve")
          .should(
            "have.attr",
            "href",
            `/login?redirect=${encodeURIComponent(`/screenings/${hold.screeningId}`)}`,
          )
          .click();
        cy.location("pathname").should("eq", "/login");
      });
    });
  });
});
