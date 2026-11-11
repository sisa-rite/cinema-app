// Runs against the real backend and database. Movies, screenings and seats
// are always picked from the UI, so the tests survive reseeding and reruns.

const MOVIE_LINKS = 'a[href^="/movies/"]';
const SHOWTIME_LINKS = 'a[href^="/screenings/"]';
const SEATS = '[data-testid="seat-map"] button[aria-label^="Row "]';
const REFERENCE_PATTERN = /^RIO-[A-HJ-NP-Z2-9]{6}$/;

function openFirstScreening() {
  cy.visit("/movies?city=oulu");
  cy.get(MOVIE_LINKS).first().click();
  cy.get(SHOWTIME_LINKS).first().click();
  cy.get('[data-testid="seat-map"]').should("be.visible");
}

function parseSeatLabel(label) {
  const [, row, seat] = label.match(/^Row (\d+), seat (\d+),/);
  return { label, text: `Row ${row} · Seat ${seat}` };
}

describe("Customer flow", () => {
  it("browses movies by city", () => {
    cy.visit("/");
    cy.contains("a", "Cinema RIO Oulu").click();

    cy.location("pathname").should("eq", "/movies");
    cy.location("search").should("include", "city=oulu");
    cy.get(MOVIE_LINKS).should("have.length.at.least", 1).first().should("be.visible");

    cy.get('nav[aria-label="Choose cinema"]').contains("a", "Tampere").click();
    cy.location("search").should("include", "city=tampere");
  });

  it("redirects an unknown city to the home page", () => {
    cy.visit("/movies?city=helsinki");
    cy.location("pathname").should("eq", "/");
  });

  it("shows the seat map with the screen at the front", () => {
    openFirstScreening();

    cy.get(SEATS).then(($seats) => {
      const lowestSeatTop = Math.max(
        ...[...$seats].map((seat) => seat.getBoundingClientRect().top),
      );
      cy.get('[data-testid="screen"]').should(($screen) => {
        expect($screen[0].getBoundingClientRect().top).to.be.greaterThan(lowestSeatTop);
      });

      const labels = [...$seats].map((seat) => seat.getAttribute("aria-label"));
      expect(labels.filter((label) => /, seat 13,/.test(label))).to.be.empty;

      const ownerSeats = [...$seats].filter((seat) =>
        /^Row \d+, seat 1,/.test(seat.getAttribute("aria-label")),
      );
      expect(ownerSeats).to.have.length(1);
      expect(ownerSeats[0]).to.be.disabled;
      expect(ownerSeats[0].getAttribute("aria-label")).to.match(/reserved for the owner$/);
    });
  });

  it("holds two seats and shows the checkout", () => {
    const email = `e2e-${Date.now()}@test.rio`;
    openFirstScreening();

    cy.get(`${SEATS}[aria-label$=", available"]`)
      .should("have.length.at.least", 2)
      .then(($seats) => {
        const picked = [...$seats]
          .slice(0, 2)
          .map((seat) => parseSeatLabel(seat.getAttribute("aria-label")));

        picked.forEach(({ label }) => cy.get(`[aria-label="${label}"]`).click());
        cy.contains("h2", "Your seats (2)");
        cy.contains("button", "Continue").click();
        cy.get('input[type="email"]').type(email);
        cy.contains("button", "Hold my seats").click();

        cy.location("pathname").should("match", /^\/checkout\/RIO-/);
        cy.get('[data-testid="booking-reference"]')
          .invoke("text")
          .should("match", REFERENCE_PATTERN)
          .then((reference) => {
            cy.location("pathname").should("eq", `/checkout/${reference}`);
          });

        cy.get('[data-testid="hold-countdown"]').should(($countdown) => {
          const [minutes, seconds] = $countdown.text().split(":").map(Number);
          expect(minutes * 60 + seconds).to.be.within(14 * 60, 15 * 60);
        });

        cy.get('ul[aria-label="Your seats"] li').should("have.length", 2);
        picked.forEach(({ text }) => {
          cy.get('ul[aria-label="Your seats"]').contains("li", text);
        });
      });
  });

  it("has no horizontal page scroll on a phone", () => {
    cy.viewport(375, 812);

    cy.visit("/");
    cy.contains("a", "Cinema RIO Oulu").should("be.visible");
    cy.document().its("documentElement.scrollWidth").should("be.lte", 375);

    openFirstScreening();
    cy.document().its("documentElement.scrollWidth").should("be.lte", 375);
  });
});
