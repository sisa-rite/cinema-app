// Creates and uses customer accounts through the UI; every run gets a new e-mail.

export const PASSWORD = "e2e-password-2026";

export function uniqueEmail() {
  return `e2e-customer-${Date.now()}-${Cypress._.random(1e6)}@test.rio`;
}

export function signUp(name, email) {
  cy.visit("/signup");
  cy.get("#signup-name").type(name);
  cy.get("#signup-email").type(email);
  cy.get("#signup-password").type(PASSWORD, { log: false });
  cy.contains("button", "Sign up").click();
}

export function logIn(email) {
  cy.get("#login-email").type(email);
  cy.get("#login-password").type(PASSWORD, { log: false });
  cy.contains("form button", "Log in").click();
}

export function logOut(name) {
  cy.contains("button", name).click();
  cy.contains("button", "Log out").click();
}
