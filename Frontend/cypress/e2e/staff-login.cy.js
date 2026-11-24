// Runs against the real backend with the seeded staff accounts.
import { logIn } from "../support/staffLogin.js";

describe("Staff login", () => {
  it("sends a logged-out visitor to the login page and back after login", () => {
    cy.visit("/admin/screenings");

    cy.location("pathname").should("eq", "/staff/login");
    cy.location("search").should("eq", `?redirect=${encodeURIComponent("/admin/screenings")}`);
    cy.contains("h1", "Staff login");

    logIn("admin@rio.test");

    cy.location("pathname").should("eq", "/admin/screenings");
    cy.contains("header a", "Rio Theatres — Admin").should("have.attr", "href", "/admin");
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
    cy.contains("header a", "Rio Theatres — Cashier").should("have.attr", "href", "/cashier");
    cy.get('nav[aria-label="Choose cinema"]').should("not.exist");

    cy.visit("/admin");
    cy.contains("h1", "You don't have access to this page");
    cy.get('nav[aria-label="Admin"]').should("not.exist");
  });

  it("sends a cashier back to the staff login after logout", () => {
    cy.visit("/staff/login");
    logIn("cashier.oulu@rio.test");
    cy.location("pathname").should("eq", "/cashier");

    cy.contains("button", "Log out").click();
    cy.location("pathname").should("eq", "/staff/login");
    cy.location("search").should("eq", "");
    cy.contains("h1", "Staff login");
  });

  it("logs out and protects admin again", () => {
    cy.visit("/staff/login");
    logIn("admin@rio.test");
    cy.location("pathname").should("eq", "/admin/screenings");

    cy.contains("button", "Log out").click();
    cy.location("pathname").should("eq", "/staff/login");
    cy.location("search").should("eq", "");
    cy.contains("h1", "Staff login");

    cy.visit("/admin");
    cy.location("pathname").should("eq", "/staff/login");
    cy.location("search").should("eq", `?redirect=${encodeURIComponent("/admin")}`);
  });
});
