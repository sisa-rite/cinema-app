// Runs against the real backend and database (customer accounts, FR-014).
import { logIn, logOut, signUp, uniqueEmail } from "../support/customerAccount.js";

const MOVIE_LINKS = 'a[href^="/movies/"]';
const SHOWTIME_LINKS = 'a[href^="/screenings/"]';
const AVAILABLE_SEATS = '[data-testid="seat-map"] button[aria-label$=", available"]';

// TODO(FR-014 backend): GET /api/me/bookings is not merged yet, so it is stubbed here.
// Remove stubMyBookings() and its calls once the backend serves the endpoint.
function stubMyBookings(body = { upcoming: [], past: [] }) {
  cy.intercept("GET", "**/api/me/bookings", { statusCode: 200, body }).as("myBookings");
}

// The age warning (FR-010) has its own spec.
function withoutAgeRating() {
  cy.intercept("GET", "**/api/screenings/*/seats", (req) => {
    delete req.headers["if-none-match"];
    req.on("before:response", (res) => {
      res.body.screening.movie.ageRating = null;
    });
  });
}

function myBookingsItem(booking, screening) {
  return {
    reference: booking.reference,
    status: booking.status,
    paymentDeadline: booking.paymentDeadline,
    paidAt: booking.paidAt,
    seats: booking.seats,
    wheelchairSpaces: booking.wheelchairSpaces,
    totalPrice: booking.totalPrice,
    screening: {
      id: screening.id,
      startsAt: screening.startsAt,
      movie: screening.movie,
      theatre: screening.theatre,
      hall: screening.hall,
    },
  };
}

describe("Customer account", () => {
  it("signs up and lands on an empty My bookings page", () => {
    stubMyBookings();
    signUp("E2E Customer", uniqueEmail());

    cy.location("pathname").should("eq", "/my-bookings");
    cy.title().should("eq", "My bookings — Rio Theatres");
    cy.contains("h1", "My bookings");
    cy.contains("No bookings yet.");
    cy.contains("a", "Browse movies").should("have.attr", "href", "/");
  });

  it("logs out and logs in again", () => {
    const email = uniqueEmail();
    stubMyBookings();
    signUp("Returning Customer", email);
    cy.location("pathname").should("eq", "/my-bookings");

    logOut("Returning Customer");
    cy.location("pathname").should("eq", "/");

    cy.contains("a", "Log in").click();
    cy.location("pathname").should("eq", "/login");
    cy.title().should("eq", "Log in — Rio Theatres");
    logIn(email);

    cy.location("pathname").should("eq", "/my-bookings");
    cy.contains("button", "Returning Customer").should("have.attr", "aria-expanded", "false");
  });

  it("buys a ticket while logged in and sees it under Upcoming", () => {
    const email = uniqueEmail();
    stubMyBookings();
    signUp("Ticket Buyer", email);
    cy.location("pathname").should("eq", "/my-bookings");

    withoutAgeRating();
    cy.intercept("GET", "**/api/screenings/*/seats").as("seats");
    cy.visit("/movies?city=oulu");
    cy.get(MOVIE_LINKS).first().click();
    cy.get(SHOWTIME_LINKS).first().click();
    cy.wait("@seats").its("response.body.screening").as("screening");

    cy.get(AVAILABLE_SEATS).first().click();
    cy.contains("button", "Continue").click();
    cy.get("#booking-email").should("have.value", email).and("have.attr", "readonly");
    cy.contains("button", "Hold my seats").click();

    cy.location("pathname").should("match", /^\/checkout\/RIO-/);
    cy.intercept("POST", "**/api/bookings/*/pay").as("pay");
    cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
    cy.contains("button", "Pay").click();
    cy.get('[data-testid="booking-confirmation"]').should("be.visible");

    cy.wait("@pay").then(({ response }) => {
      const booking = response.body;
      cy.get("@screening").then((screening) => {
        stubMyBookings({ upcoming: [myBookingsItem(booking, screening)], past: [] });
      });

      cy.contains("button", "Ticket Buyer").click();
      cy.contains("a", "My bookings").click();

      cy.contains("section", "Upcoming").within(() => {
        cy.get('[data-testid="booking-card"]')
          .should("have.length", 1)
          .within(() => {
            cy.get('[data-testid="booking-status"]').should("have.text", "Paid");
            cy.get('[data-testid="booking-reference"]').should("have.text", booking.reference);
            cy.contains("a", "View confirmation").click();
          });
      });
      cy.location("pathname").should("eq", `/checkout/${booking.reference}`);
      cy.get('[data-testid="booking-confirmation"]').should("be.visible");
    });
  });

  it("sends a logged-out visitor from My bookings to the login and back", () => {
    const email = uniqueEmail();
    stubMyBookings();
    signUp("Redirected Customer", email);
    cy.location("pathname").should("eq", "/my-bookings");
    logOut("Redirected Customer");
    cy.location("pathname").should("eq", "/");

    cy.visit("/my-bookings");
    cy.location("pathname").should("eq", "/login");
    cy.location("search").should("eq", `?redirect=${encodeURIComponent("/my-bookings")}`);
    logIn(email);

    cy.location("pathname").should("eq", "/my-bookings");
    cy.contains("No bookings yet.");
  });

  it("shows EMAIL_TAKEN under the e-mail field", () => {
    const email = uniqueEmail();
    stubMyBookings();
    signUp("First Owner", email);
    cy.location("pathname").should("eq", "/my-bookings");
    logOut("First Owner");

    signUp("Second Owner", email);
    cy.get("#signup-email").should("have.attr", "aria-invalid", "true");
    cy.get("#signup-email-error")
      .should("contain", "An account with this e-mail already exists.")
      .find("a")
      .should("have.text", "Log in instead")
      .and("have.attr", "href", "/login");
    cy.location("pathname").should("eq", "/signup");
  });

  it("shows field errors and the password rule", () => {
    cy.visit("/signup");
    cy.title().should("eq", "Sign up — Rio Theatres");
    cy.get("#signup-password-hint").should("have.text", "At least 8 characters.");
    cy.contains("button", "Sign up").click();

    cy.get("#signup-name").should("have.attr", "aria-invalid", "true");
    cy.get("#signup-password")
      .should("have.attr", "aria-describedby", "signup-password-hint signup-password-error");
  });

  it("has no horizontal page scroll on a phone", () => {
    cy.viewport(375, 812);
    stubMyBookings();

    cy.visit("/");
    cy.contains("a", "Log in").should("be.visible");
    cy.document().its("documentElement.scrollWidth").should("be.lte", 375);

    cy.visit("/movies?city=oulu");
    cy.contains("header a", "Log in").should("be.visible");
    cy.document().its("documentElement.scrollWidth").should("be.lte", 375);

    signUp("Phone Customer With A Long Name", uniqueEmail());
    cy.location("pathname").should("eq", "/my-bookings");
    cy.get("header").contains("button", "Phone Customer With A Long Name").click();
    cy.contains("a", "My bookings").should("be.visible");
    cy.document().its("documentElement.scrollWidth").should("be.lte", 375);

    cy.visit("/");
    cy.contains("button", "Phone Customer With A Long Name").should("be.visible");
    cy.document().its("documentElement.scrollWidth").should("be.lte", 375);
  });
});
