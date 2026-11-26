// Reserve and pay later, cancel (FR-015, FR-016, FR-018). Holds and payments run against
// the real backend; reserve and cancel are not merged yet, so their responses are stubbed
// from the real hold.
import { formatDayLabel, formatTime } from "../../src/utils/format.js";
import { signUp, uniqueEmail } from "../support/customerAccount.js";

const MOVIE_LINKS = 'a[href^="/movies/"]';
const SHOWTIME_LINKS = 'a[href^="/screenings/"]';
const AVAILABLE_SEATS = '[data-testid="seat-map"] button[aria-label$=", available"]';
const HOUR = 60 * 60 * 1000;

function inHours(hours) {
  return new Date(Date.now() + hours * HOUR).toISOString();
}

function formatDeadline(iso) {
  return `${formatDayLabel(iso)}, ${formatTime(iso)}`;
}

// Stays on purpose (not a TODO stub): every movie is unrated (FR-010 has its own spec), and
// startsAt pins the screening start so the 2-hour reservation rule does not depend on the seed.
function withScreening({ startsAt } = {}) {
  cy.intercept("GET", "**/api/screenings/*/seats", (req) => {
    // Without this the browser may revalidate and get an empty 304 instead of the seats.
    delete req.headers["if-none-match"];
    req.on("before:response", (res) => {
      res.body.screening.movie.ageRating = null;
      if (startsAt) res.body.screening.startsAt = startsAt;
    });
  }).as("seats");
}

// Holds the first available seat of the first Oulu screening; yields the real hold.
function holdSeat(guestEmail) {
  cy.intercept("POST", "**/api/bookings").as("hold");
  cy.visit("/movies?city=oulu");
  cy.get(MOVIE_LINKS).first().click();
  cy.get(SHOWTIME_LINKS).first().click();
  cy.get(AVAILABLE_SEATS).first().click();
  cy.contains("button", "Continue").click();
  // A customer's e-mail field disappears once the account is loaded.
  if (guestEmail) cy.get("#booking-email").type(guestEmail);
  else cy.get("#booking-email").should("not.exist");
  cy.contains("button", "Hold my seats").click();
  cy.location("pathname").should("match", /^\/checkout\/RIO-/);
  return cy.wait("@hold").its("response.body");
}

function signUpAndHold(name) {
  signUp(name, uniqueEmail());
  cy.location("pathname").should("eq", "/my-bookings");
  return holdSeat();
}

function reservedFrom(hold, startsAt) {
  return {
    ...hold,
    status: "reserved",
    paymentDeadline: new Date(Date.parse(startsAt) - 2 * HOUR).toISOString(),
    paidAt: null,
  };
}

// TODO: remove when FR-015/016 backend is merged
function stubReserve(reserved) {
  cy.intercept("POST", `**/api/bookings/${reserved.reference}/reserve`, {
    statusCode: 200,
    body: reserved,
  }).as("reserve");
}

// TODO: remove when FR-015/016 backend is merged (the real GET then returns the reservation)
function stubGetReservation(reserved) {
  cy.intercept("GET", `**/api/bookings/${reserved.reference}*`, {
    statusCode: 200,
    body: reserved,
  }).as("getReservation");
}

// TODO: remove when FR-015/016 backend is merged (My bookings then lists the real reservation)
function stubMyReservation(reserved, screening) {
  const item = {
    reference: reserved.reference,
    status: reserved.status,
    paymentDeadline: reserved.paymentDeadline,
    paidAt: null,
    seats: reserved.seats,
    wheelchairSpaces: reserved.wheelchairSpaces,
    wheelchairDiscounts: reserved.wheelchairDiscounts,
    totalPrice: reserved.totalPrice,
    screening: {
      id: screening.id,
      startsAt: screening.startsAt,
      movie: { id: screening.movie.id, title: screening.movie.title, posterUrl: screening.movie.posterUrl },
      theatre: { name: screening.theatre.name, city: screening.theatre.city },
      hall: { name: screening.hall.name },
    },
  };
  cy.intercept("GET", "**/api/me/bookings", {
    statusCode: 200,
    body: { upcoming: [item], past: [] },
  }).as("myBookings");
}

// TODO: remove when FR-018 backend is merged
function stubCancel(reserved) {
  cy.intercept("POST", `**/api/bookings/${reserved.reference}/cancel`, {
    statusCode: 200,
    body: { ...reserved, status: "cancelled", seats: [], wheelchairSpaces: 0, wheelchairDiscounts: 0 },
  }).as("cancel");
}

describe("Reservations", () => {
  it("reserves held seats without the no-refund confirmation and shows the deadline", () => {
    cy.viewport(375, 812);
    const startsAt = inHours(72);
    const deadline = new Date(Date.parse(startsAt) - 2 * HOUR).toISOString();
    withScreening({ startsAt });

    signUpAndHold("Reserving Customer").then((hold) => {
      stubReserve(reservedFrom(hold, startsAt));

      cy.get('[data-testid="reserve-hint"]').should(
        "have.text",
        `Pay at the latest 2 hours before the screening (by ${formatDeadline(deadline)}).`,
      );
      cy.contains("button", /^Pay$/).should("be.disabled");
      cy.contains("button", "Reserve and pay later").should("be.enabled").click();
      cy.wait("@reserve");

      cy.get('[data-testid="reservation-confirmation"]').within(() => {
        cy.contains("h1", "Reservation confirmed").should("be.focused");
        cy.get('[data-testid="payment-deadline"]')
          .should("have.text", formatDeadline(deadline))
          .and("have.attr", "datetime", deadline);
        cy.get('[data-testid="booking-reference"]').should("have.text", hold.reference);
        cy.contains("a", "Go to My bookings").should("have.attr", "href", "/my-bookings");
        cy.contains("button", "Cancel reservation");
      });
      cy.document().its("documentElement.scrollWidth").should("be.lte", 375);
    });
  });

  it("pays a reservation and shows the confirmation", () => {
    const startsAt = inHours(72);
    withScreening({ startsAt });

    signUpAndHold("Paying Customer").then((hold) => {
      const reserved = reservedFrom(hold, startsAt);
      stubReserve(reserved);
      cy.contains("button", "Reserve and pay later").click();
      cy.contains("h1", "Reservation confirmed");

      // Coming back later, e.g. from My bookings: the page loads the reservation again.
      stubGetReservation(reserved);
      cy.reload();
      cy.wait("@getReservation");
      cy.contains("h1", "Reservation confirmed");

      // The real pay endpoint: the booking is still a valid hold on the server.
      cy.intercept("POST", `**/api/bookings/${hold.reference}/pay`).as("pay");
      cy.contains("button", /^Pay$/).should("be.disabled");
      cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
      cy.contains("button", /^Pay$/).should("be.enabled").click();
      cy.wait("@pay").its("response.statusCode").should("eq", 200);

      cy.get('[data-testid="booking-confirmation"]').within(() => {
        cy.contains("h1", "Your tickets are confirmed");
        cy.get('[data-testid="booking-reference"]').should("have.text", hold.reference);
      });
    });
  });

  it("cancels a reservation from My bookings after confirming", () => {
    const startsAt = inHours(72);
    withScreening({ startsAt });

    signUpAndHold("Cancelling Customer").then((hold) => {
      const reserved = reservedFrom(hold, startsAt);
      cy.get("@seats").its("response.body.screening").then((screening) => {
        stubMyReservation(reserved, screening);
      });
      stubCancel(reserved);

      cy.visit("/my-bookings");
      // The list is requested only after the account has loaded.
      cy.wait("@myBookings");
      cy.get('[data-testid="booking-card"]')
        .should("have.length", 1)
        .within(() => {
          cy.get('[data-testid="booking-status"]').should("have.text", "Reserved");
          cy.contains("a", "Pay now").should(
            "have.attr",
            "href",
            `/checkout/${hold.reference}?city=oulu`,
          );
          cy.contains("button", "Cancel reservation").click();
        });

      cy.get('[data-testid="cancel-reservation-dialog"]')
        .should("be.visible")
        .within(() => {
          cy.contains("h2", "Cancel this reservation?");
          cy.contains("The seats will be released.");
          cy.contains("button", "Keep it").should("be.focused").click();
        });
      cy.get('[data-testid="cancel-reservation-dialog"]').should("not.be.visible");
      cy.get("@cancel.all").should("have.length", 0);
      cy.get('[data-testid="booking-status"]').should("have.text", "Reserved");

      cy.get('[data-testid="booking-card"]').contains("button", "Cancel reservation").click();
      cy.get('[data-testid="cancel-reservation-dialog"]')
        .contains("button", "Cancel reservation")
        .click();
      cy.wait("@cancel");

      cy.get('[data-testid="booking-card"]').within(() => {
        cy.get('[data-testid="booking-status"]').should("have.text", "Cancelled");
        cy.contains('[role="status"]', "Reservation cancelled.").should("be.focused");
        cy.contains("button", "Cancel reservation").should("not.exist");
        cy.contains("a", "Pay now").should("not.exist");
      });
    });
  });

  it("disables reserving less than 2 hours before the screening", () => {
    withScreening({ startsAt: inHours(1.5) });

    signUpAndHold("Late Customer").then(() => {
      cy.contains("button", "Reserve and pay later").should("be.disabled");
      cy.get('[data-testid="reserve-hint"]').should(
        "have.text",
        "Reservations close 2 hours before the screening.",
      );
      cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
      cy.contains("button", /^Pay$/).should("be.enabled");
    });
  });

  it("asks a guest to log in to reserve", () => {
    withScreening();

    holdSeat(`e2e-guest-${Date.now()}@test.rio`).then((hold) => {
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
