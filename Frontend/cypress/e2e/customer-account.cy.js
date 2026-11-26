// Runs against the real backend and database (customer accounts, FR-014).
import { logIn, logOut, signUp, uniqueEmail } from "../support/customerAccount.js";

const MOVIE_LINKS = 'a[href^="/movies/"]';
const SHOWTIME_LINKS = 'a[href^="/screenings/"]';
const AVAILABLE_SEATS = '[data-testid="seat-map"] button[aria-label$=", available"]';

// Stays on purpose (not a TODO stub): the seed has no past bookings, and a new account
// cannot create one, so the past list is the only response stubbed in this spec.
function stubPastBooking(booking) {
  cy.intercept("GET", "**/api/me/bookings", { statusCode: 200, body: { upcoming: [], past: [booking] } });
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

describe("Customer account", () => {
  it("signs up and lands on an empty My bookings page", () => {
    signUp("E2E Customer", uniqueEmail());

    cy.location("pathname").should("eq", "/my-bookings");
    cy.title().should("eq", "My bookings — Rio Theatres");
    cy.contains("h1", "My bookings");
    cy.contains("No bookings yet.");
    cy.contains("a", "Browse movies").should("have.attr", "href", "/");
  });

  it("logs out and logs in again", () => {
    const email = uniqueEmail();
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
    signUp("Ticket Buyer", email);
    cy.location("pathname").should("eq", "/my-bookings");

    withoutAgeRating();
    cy.visit("/movies?city=oulu");
    cy.get(MOVIE_LINKS).first().click();
    cy.get(SHOWTIME_LINKS).first().click();

    cy.get(AVAILABLE_SEATS).first().click();
    cy.contains("button", "Continue").click();
    cy.get("#booking-email").should("not.exist");
    cy.contains("button", "Hold my seats").should("be.focused").click();

    cy.location("pathname").should("match", /^\/checkout\/RIO-/);
    cy.intercept("POST", "**/api/bookings/*/pay").as("pay");
    cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
    cy.contains("button", "Pay").click();
    cy.get('[data-testid="booking-confirmation"]').should("be.visible");

    cy.wait("@pay").then(({ response }) => {
      const booking = response.body;
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

  it("shows the year for past bookings", () => {
    stubPastBooking({
      reference: "RIO-PAST22",
      status: "paid",
      paymentDeadline: null,
      paidAt: "2025-11-09T12:08:41.000Z",
      seats: [{ id: 1, rowNumber: 1, seatNumber: 2, ticketType: "adult", price: 12.5 }],
      wheelchairSpaces: 0,
      totalPrice: 12.5,
      screening: {
        id: 1,
        startsAt: "2025-11-12T15:30:00.000Z",
        movie: { id: 1, title: "Past Movie", posterUrl: null },
        theatre: { name: "Cinema RIO Oulu", city: "oulu" },
        hall: { name: "Hall 1" },
      },
    });
    signUp("Past Customer", uniqueEmail());

    cy.contains("section", "Past")
      .find('[data-testid="booking-card"] time')
      .first()
      .should("have.text", "Wed 12 Nov 2025 · 17:30");
  });

  it("offers a different e-mail when the account e-mail finds no booking", () => {
    signUp("Guest Booking Owner", uniqueEmail());
    cy.location("pathname").should("eq", "/my-bookings");

    // A valid reference format that no booking uses.
    cy.visit("/checkout/RIO-ZZZZZZ");
    cy.contains("h1", "Booking not found");
    cy.contains("button", "Use a different e-mail").click();

    cy.contains("h1", "Find your booking");
    cy.get("#checkout-email").should("have.value", "");
  });

  it("shows EMAIL_TAKEN under the e-mail field", () => {
    const email = uniqueEmail();
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
