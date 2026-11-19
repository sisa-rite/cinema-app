const MOVIE_LINKS = 'a[href^="/movies/"]';
const SHOWTIME_LINKS = 'a[href^="/screenings/"]';
const AVAILABLE_SEATS = '[data-testid="seat-map"] button[aria-label$=", available"]';

export function openFirstScreening({ ageRating, beforeResponse } = {}) {
  cy.intercept("GET", "**/api/screenings/*/seats", (req) => {
    delete req.headers["if-none-match"];
    req.on("before:response", (res) => {
      if (ageRating !== undefined) {
        res.body.screening.movie.ageRating = ageRating;
      }
      beforeResponse?.(res.body);
    });
  });
  cy.visit("/movies?city=oulu");
  cy.get(MOVIE_LINKS).first().click();
  cy.get(SHOWTIME_LINKS).first().click();
  cy.get('[data-testid="seat-map"]').should("be.visible");
}

export function selectSeats(count) {
  for (let index = 0; index < count; index += 1) {
    cy.get(AVAILABLE_SEATS).first().click();
  }
  cy.contains("h2", `Your tickets (${count})`);
}

export function continueToEmail(email) {
  cy.contains("button", "Continue").click();
  cy.get('input[type="email"]').type(email);
}

export function holdSeats(email) {
  continueToEmail(email);
  cy.contains("button", "Hold my seats").click();
  cy.location("pathname").should("match", /^\/checkout\/RIO-/);
}
