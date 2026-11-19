// FR-021 / FR-023: adult and child tickets for the selected seats, and wheelchair
// spaces without a seat. Prices are read from the seats response, so the tests do
// not depend on the seeded base price or premiere flag.

const AVAILABLE_SEATS = '[data-testid="seat-map"] button[aria-label$=", available"]';
const step = (label) => cy.get(`button[aria-label="${label}"]`);
const count = (id) => cy.get(`[data-testid="${id}-count"]`);

function openScreening() {
  let prices;
  cy.intercept("GET", "**/api/screenings/*/seats", (req) => {
    // Without this the browser may revalidate and get an empty 304 instead of the seats.
    delete req.headers["if-none-match"];
    req.on("before:response", (res) => {
      // The age warning (FR-010) has its own spec.
      res.body.screening.movie.ageRating = null;
      res.body.screening.wheelchairSpaces.available = 10;
      prices = res.body.screening.prices;
    });
  });
  cy.visit("/movies?city=oulu");
  cy.get('a[href^="/movies/"]').first().click();
  cy.get('a[href^="/screenings/"]').first().click();
  cy.get('[data-testid="seat-map"]').should("be.visible");
  // Read once the page has rendered; React's dev double-fetch cancels the first request.
  return cy.then(() => prices);
}

function selectSeats(amount) {
  for (let index = 0; index < amount; index += 1) {
    cy.get(AVAILABLE_SEATS).first().click();
  }
}

function expectTotal(amount) {
  const text = new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" }).format(amount);
  cy.get('[data-testid="selection-total"]').should("have.text", text);
}

describe("Ticket types and wheelchair spaces", () => {
  it("turns seats into child tickets and books them", () => {
    const email = `e2e-${Date.now()}@test.rio`;
    openScreening().then((prices) => {
      step("Add child ticket").should("be.disabled");
      step("Add wheelchair space").should("be.enabled");

      selectSeats(2);
      count("child-tickets").should("have.text", "0");
      cy.get('[data-testid="adult-tickets"]').should("contain", "2 × Adult ticket");
      expectTotal(prices.adult * 2);

      step("Add child ticket").click();
      count("child-tickets").should("have.text", "1");
      cy.get('[data-testid="adult-tickets"]').should("contain", "1 × Adult ticket");
      expectTotal(prices.adult + prices.child);

      step("Add child ticket").click();
      step("Add child ticket").should("be.disabled");
      cy.get('[data-testid="adult-tickets"]').should("contain", "0 × Adult ticket");
      expectTotal(prices.child * 2);
      step("Remove child ticket").click();

      cy.contains("button", "Continue").click();
      cy.get('input[type="email"]').type(email);
      cy.contains("button", "Hold my seats").click();

      cy.location("pathname").should("match", /^\/checkout\/RIO-/);
      cy.get('ul[aria-label="Your seats"] li').should("have.length", 2);
      cy.get('ul[aria-label="Your seats"]').contains("li", "· Adult");
      cy.get('ul[aria-label="Your seats"]').contains("li", "· Child");
    });
  });

  it("allows wheelchair spaces without seats and shares the 10-ticket limit", () => {
    openScreening().then((prices) => {
      step("Add wheelchair space").click();
      cy.contains("h2", "Your tickets (1)");
      expectTotal(prices.adult);
      cy.contains("button", "Continue").should("be.enabled");

      for (let index = 0; index < 3; index += 1) step("Add wheelchair space").click();
      count("wheelchair-spaces").should("have.text", "4");

      selectSeats(6);
      cy.contains("h2", "Your tickets (10)");
      cy.contains("You can select up to 6 seats.");
      cy.get(AVAILABLE_SEATS).first().should("be.disabled");
      step("Add wheelchair space").should("be.disabled");
      cy.contains("One order can have up to 10 tickets.");

      step("Remove wheelchair space").click();
      cy.get(AVAILABLE_SEATS).first().should("be.enabled");
    });
  });
});
