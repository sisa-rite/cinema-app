// Logs in on the staff login page with a seeded account.
// Cypress 16 removed Cypress.env(); cy.env() reads secrets such as the seed password.

function typePassword(password) {
  cy.get("#staff-password").type(password, { log: false });
}

export function logIn(email, password) {
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
