import { holdSeats, openFirstScreening, selectSeats } from "../support/customerFlow.js";

const PAY_URL = "**/api/bookings/*/pay";
const REFERENCE_PATTERN = /^RIO-[A-HJ-NP-Z2-9]{6}$/;

function holdOneSeat(email) {
  openFirstScreening({ ageRating: null });
  selectSeats(1);
  holdSeats(email);
  cy.location("pathname").should("match", /^\/checkout\/RIO-/);
  cy.get('[data-testid="booking-reference"]').invoke("text").should("match", REFERENCE_PATTERN);
}

describe("Payment edge cases", () => {
  it("shows the expired-hold state and returns to seat selection", () => {
    holdOneSeat(`expired-${Date.now()}@test.rio`);

    cy.intercept("POST", PAY_URL, {
      statusCode: 409,
      body: { error: { code: "HOLD_EXPIRED", message: "The booking hold has expired." } },
    }).as("pay");

    cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
    cy.contains("button", "Pay").click();
    cy.wait("@pay");

    cy.contains("h1", "Your hold has expired.");
    cy.contains("Your seats have been released for other customers.");
    cy.contains("button", "Pay").should("not.exist");
    cy.contains("a", "Choose seats again").should("have.attr", "href").and("match", /^\/screenings\/\d+/);
  });

  it("shows the sales-closed state without confirmation", () => {
    holdOneSeat(`closed-${Date.now()}@test.rio`);

    cy.intercept("POST", PAY_URL, {
      statusCode: 409,
      body: { error: { code: "SALES_CLOSED", message: "Sales for this screening have closed." } },
    }).as("pay");

    cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
    cy.contains("button", "Pay").click();
    cy.wait("@pay");

    cy.contains("h1", "Sales for this screening have closed.");
    cy.contains("The screening has already started, so your seats could not be paid for.");
    cy.get('[data-testid="booking-confirmation"]').should("not.exist");
  });

  it("blocks a second payment when Pay is clicked twice", () => {
    holdOneSeat(`double-${Date.now()}@test.rio`);

    cy.intercept("POST", PAY_URL).as("pay");
    cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
    cy.contains("button", "Pay").dblclick();

    cy.wait("@pay");
    cy.get("@pay.all").should("have.length", 1);
    cy.get('[data-testid="booking-confirmation"]').should("be.visible");
  });

  it("requires the no-refund checkbox and disables Pay when unticked", () => {
    holdOneSeat(`refund-${Date.now()}@test.rio`);

    const checkbox = cy.contains("label", "I understand that paid tickets cannot be refunded.")
      .find("input[type=checkbox]");
    checkbox.should("not.be.checked");
    cy.contains("button", "Pay").should("be.disabled");

    checkbox.check();
    cy.contains("button", "Pay").should("be.enabled");
    checkbox.uncheck();
    cy.contains("button", "Pay").should("be.disabled");
  });

  it("reopens a paid booking in reload and fresh visits", () => {
    const email = `reload-${Date.now()}@test.rio`;
    holdOneSeat(email);

    cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
    cy.contains("button", "Pay").click();
    cy.get('[data-testid="booking-confirmation"]').should("be.visible");

    cy.location("pathname").then((checkoutPath) => {
      cy.get('[data-testid="booking-confirmation"]').within(() => {
        cy.get('[data-testid="booking-reference"]').invoke("text").as("reference");
        cy.get('ul[aria-label="Your seats"] li').should("have.length", 1);
        cy.contains("Total");
      });

      cy.reload();
      cy.get('[data-testid="booking-confirmation"]').should("be.visible");
      cy.get('[data-testid="booking-confirmation"]').find('[data-testid="booking-reference"]')
        .invoke("text").should("match", REFERENCE_PATTERN);
      cy.get('[data-testid="booking-confirmation"]').find('ul[aria-label="Your seats"] li')
        .should("have.length", 1);
      cy.get('[data-testid="booking-confirmation"]').contains("Total");

      cy.visit(checkoutPath);
      cy.get('[data-testid="booking-confirmation"]').should("be.visible");
      cy.get('[data-testid="booking-confirmation"]').find('[data-testid="booking-reference"]')
        .invoke("text").should("match", REFERENCE_PATTERN);
      cy.get('[data-testid="booking-confirmation"]').find('ul[aria-label="Your seats"] li')
        .should("have.length", 1);
      cy.get('[data-testid="booking-confirmation"]').contains("Total");
    });
  });

  it("asks for the e-mail and hides details after an unknown e-mail", () => {
    holdOneSeat(`wrong-email-${Date.now()}@test.rio`);

    cy.location("pathname").then((checkoutPath) => {
      cy.window().then((win) => win.sessionStorage.clear());
      cy.visit(checkoutPath);
      cy.contains("h1", "Find your booking");
      cy.contains("Enter the e-mail you used");
      cy.get('[data-testid="booking-confirmation"]').should("not.exist");

      cy.get("#checkout-email").type(`unknown-${Date.now()}@test.rio`);
      cy.contains("button", "Show my booking").click();
      cy.contains("h1", "Booking not found");
      cy.contains("We couldn’t find a booking with this reference and e-mail address.");
      cy.get('[data-testid="booking-confirmation"]').should("not.exist");
    });
  });
});
