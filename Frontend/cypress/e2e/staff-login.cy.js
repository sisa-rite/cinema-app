// Runs against the real backend with the seeded staff accounts.
// Cypress 16 removed Cypress.env(); cy.env() reads secrets such as the seed password.

function typePassword(password) {
  cy.get("#staff-password").type(password, { log: false });
}

function logIn(email, password) {
  cy.get("#staff-email").type(email);
  if (password) {
    typePassword(password);
  } else {
    cy.env(["SEED_PASSWORD"], { log: false }).then(({ SEED_PASSWORD }) =>
      typePassword(SEED_PASSWORD ?? "Rio-demo-2026"),
    );
  }
  cy.contains("button", "Log in").click();
}

describe("Staff login", () => {
  it("sends a logged-out visitor to the login page and back after login", () => {
    cy.visit("/admin/screenings");

    cy.location("pathname").should("eq", "/staff/login");
    cy.location("search").should("eq", `?redirect=${encodeURIComponent("/admin/screenings")}`);
    cy.contains("h1", "Staff login");

    logIn("admin@rio.test");

    cy.location("pathname").should("eq", "/admin/screenings");
    cy.get('nav[aria-label="Admin"]').within(() => {
      cy.contains("a", "Movies").should("be.visible");
      cy.contains("a", "Screenings").should("have.attr", "aria-current", "page");
    });
  });

  it("shows an error for a wrong password", () => {
    cy.visit("/staff/login");
    logIn("admin@rio.test", "wrong-password");

    cy.get('[role="alert"]').should("have.text", "Wrong e-mail or password.");
    cy.location("pathname").should("eq", "/staff/login");
  });

  it("lands a cashier on the cashier page and keeps them out of admin", () => {
    cy.visit("/staff/login");
    logIn("cashier.oulu@rio.test");

    cy.location("pathname").should("eq", "/cashier");
    cy.contains("Logged in as Oulu Cashier");

    cy.visit("/admin");
    cy.contains("h1", "You don't have access to this page");
    cy.get('nav[aria-label="Admin"]').should("not.exist");
  });

  it("logs out and protects admin again", () => {
    cy.visit("/staff/login");
    logIn("admin@rio.test");
    cy.location("pathname").should("eq", "/admin/screenings");

    cy.contains("button", "Log out").click();
    cy.location("pathname").should("eq", "/");

    cy.visit("/admin");
    cy.location("pathname").should("eq", "/staff/login");
    cy.location("search").should("eq", `?redirect=${encodeURIComponent("/admin")}`);
  });
});
