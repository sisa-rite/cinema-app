// FR-010: the rating comes from a stubbed seats response, so the tests do not
// depend on the seeded movies.

const AVAILABLE_SEATS = '[data-testid="seat-map"] button[aria-label$=", available"]';
const DIALOG = '[data-testid="age-warning"]';
const EMAIL_INPUT = 'input[type="email"]';

function openScreeningRated(ageRating) {
  cy.intercept("GET", "**/api/screenings/*/seats", (req) => {
    // Without this the browser may revalidate and get an empty 304 instead of the seats.
    delete req.headers["if-none-match"];
    req.on("before:response", (res) => {
      res.body.screening.movie.ageRating = ageRating;
    });
  });
  cy.visit("/movies?city=oulu");
  cy.get('a[href^="/movies/"]').first().click();
  cy.get('a[href^="/screenings/"]').first().click();
  cy.get('[data-testid="seat-map"]').should("be.visible");
}

function selectFirstAvailableSeat() {
  return cy
    .get(AVAILABLE_SEATS)
    .first()
    .invoke("attr", "aria-label")
    .then((label) => {
      cy.get(`[aria-label="${label}"]`).click();
      cy.contains("h2", "Your seats (1)");
      // Yields the label the seat has once selected.
      cy.wrap(label.replace(/, available$/, ", selected"));
    });
}

// cy.press() sends Escape without a key code, which Chromium does not treat as a
// close request for a <dialog>. A DevTools protocol key event is a real key press.
function pressEscape() {
  const key = { key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 };
  const dispatch = (type) =>
    Cypress.automation("remote:debugger:protocol", {
      command: "Input.dispatchKeyEvent",
      params: { type, ...key },
    });
  cy.then(() => dispatch("keyDown").then(() => dispatch("keyUp")));
}

function expectBackOnSeats(selectedLabel) {
  cy.get(DIALOG).should("not.be.visible");
  cy.get(`[aria-label="${selectedLabel}"]`).should("exist");
  cy.contains("h2", "Your seats (1)");
  cy.get(EMAIL_INPUT).should("not.exist");
}

describe("Age rating warning", () => {
  it("asks to confirm a K-16 rating before the e-mail step", () => {
    openScreeningRated("K-16");

    selectFirstAvailableSeat().then((selectedLabel) => {
      cy.contains("button", "Continue").click();
      cy.get(DIALOG)
        .should("be.visible")
        .and("contain", "K-16")
        .and("contain", "not recommended for children under 16");
      cy.contains("button", "I understand, continue").should("be.focused");
      cy.contains("button", "Go back").click();
      expectBackOnSeats(selectedLabel);

      cy.contains("button", "Continue").click();
      cy.get(DIALOG).should("be.visible");
      pressEscape();
      expectBackOnSeats(selectedLabel);

      cy.contains("button", "Continue").click();
      cy.get(`${DIALOG} button[aria-label="Close"]`).click();
      expectBackOnSeats(selectedLabel);

      cy.contains("button", "Continue").click();
      cy.contains("button", "I understand, continue").click();
      cy.get(DIALOG).should("not.be.visible");
      cy.get(EMAIL_INPUT).should("be.visible");
    });
  });

  it("goes straight to the e-mail step for an S rating", () => {
    openScreeningRated("S");

    selectFirstAvailableSeat();
    cy.contains("button", "Continue").click();
    cy.get(EMAIL_INPUT).should("be.visible");
    cy.get(DIALOG).should("not.exist");
  });
});
