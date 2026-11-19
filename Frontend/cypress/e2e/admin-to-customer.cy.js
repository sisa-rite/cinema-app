// The paid screening stays in the database. Locally, npm run seed -- --reset removes it.
import { addDays, todayKey } from "../../src/utils/format.js";
import { logIn } from "../support/staffLogin.js";

const minuteIndex = Math.floor(Date.now() / 60_000);
const day = addDays(todayKey(), 40 + (minuteIndex % 20));
const listUrl = `/admin/screenings?from=${day}`;
const lockedRowMessage = "Has tickets — cannot be changed";
const euro = (amount) => new Intl.NumberFormat("fi-FI", { style: "currency", currency: "EUR" }).format(amount);

function timeFor(offsetMinutes) {
  const minute = (minuteIndex + offsetMinutes) % 60;
  const hour = offsetMinutes <= 3 ? 16 : offsetMinutes <= 9 ? 20 : 22;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function fillScreening({ movieId, time, price, published, premiere = false }) {
  cy.get("#screening-movieId").select(String(movieId));
  cy.get("#screening-hallId option").then((options) => {
    const hall = [...options].find((item) => item.value);
    expect(hall, "Oulu hall").to.exist;
    cy.get("#screening-hallId").select(hall.value);
  });
  cy.get("#screening-dayKey").type(day);
  cy.get("#screening-time").type(time);
  cy.get("#screening-basePrice").clear().type(price);
  if (premiere) cy.contains("label", "Mark as premiere").find("input").check();
  if (published) cy.contains("label", "Visible to customers").find("input").check();
}

describe("Admin changes reach customers", () => {
  it("does not sell an unpublished screening", () => {
    const time = timeFor(1);
    let movieId;

    cy.visit("/admin/screenings/new");
    logIn("admin@rio.test");
    cy.get("#screening-movieId option").then((options) => {
      const movie = [...options].find((item) => item.value && !item.text.endsWith("(hidden)"));
      expect(movie, "published movie").to.exist;
      movieId = Number(movie.value);
      fillScreening({ movieId, time, price: "10", published: false });
    }).then(() => {
      cy.intercept("POST", "**/api/admin/screenings").as("createScreening");
      cy.contains("button", "Create screening").click();
      cy.wait("@createScreening").its("response.statusCode").should("eq", 201);
      cy.location("pathname").then((pathname) => {
        const screeningId = Number(pathname.split("/").pop());
        cy.visit(`/movies/${movieId}?city=oulu&date=${day}`);
        cy.get(`a[href="/screenings/${screeningId}?city=oulu"]`).should("not.exist");
      });
    });
  });

  it("publishes a premiere at 11.50 EUR, sells a 17.25 EUR adult-child total, and locks it", () => {
    const time = timeFor(7);
    const title = `E2E premiere ${Date.now()}`;
    let movieId;
    let screeningId;

    cy.visit("/admin/movies/new");
    logIn("admin@rio.test");
    cy.get("#movie-title").type(title);
    cy.get("#movie-durationMinutes").type("100");
    cy.contains("label", "Visible to customers").find("input").check();
    cy.contains("button", "Create movie").click();
    cy.location("pathname").should("match", /^\/admin\/movies\/\d+$/);
    cy.location("pathname").then((pathname) => {
      movieId = Number(pathname.split("/").pop());

      cy.visit("/admin/screenings/new");
      fillScreening({ movieId, time, price: "10", published: true, premiere: true });
      cy.intercept("POST", "**/api/admin/screenings").as("createPremiere");
      cy.contains("button", "Create screening").click();
      cy.wait("@createPremiere").then(({ response }) => {
        expect(response.statusCode, JSON.stringify(response.body)).to.eq(201);
      });
      cy.location("pathname").then((screeningPath) => {
        screeningId = Number(screeningPath.split("/").pop());

        cy.visit(`/movies/${movieId}?city=oulu&date=${day}`);
        cy.get(`a[href="/screenings/${screeningId}?city=oulu"]`).within(() => {
          cy.contains("Premiere");
          cy.contains(euro(11.5));
        });

        cy.visit(`/screenings/${screeningId}?city=oulu`);
        cy.get('[data-testid="seat-map"]').should("be.visible");
        cy.get('[data-testid="seat-map"] button[aria-label$=", available"]')
          .should("have.length.at.least", 2);
        cy.get('[data-testid="seat-map"] button[aria-label$=", available"]').eq(0).click();
        cy.get('[data-testid="seat-map"] button[aria-label$=", available"]').eq(0).click();
        cy.get('button[aria-label="Add child ticket"]').click();
        cy.get('[data-testid="selection-total"]').should("have.text", euro(17.25));

        cy.get('[data-testid="seat-map"] button[aria-label$=", selected"]').then(($selected) => {
          [...$selected].forEach((seat) => cy.wrap(seat).click());
        });
        cy.get('[data-testid="seat-map"] button[aria-label$=", available"]').first().click();

        const email = `premiere-lock-${Date.now()}@test.rio`;
        cy.contains("button", "Continue").click();
        cy.get('input[type="email"]').type(email);
        cy.contains("button", "Hold my seats").click();
        cy.location("pathname").should("match", /^\/checkout\/RIO-/);
        cy.contains("label", "I understand that paid tickets cannot be refunded.").click();
        cy.contains("button", "Pay").click();
        cy.get('[data-testid="booking-confirmation"]').should("be.visible");

        cy.visit(listUrl);
        cy.location("pathname").should("eq", "/admin/screenings");
        cy.contains('table [data-testid="screening-row"]', time).within(() => {
          cy.contains("1 sold · 0 held");
          cy.contains("button", "Hide").should("be.disabled");
          cy.contains("button", "Delete").should("be.disabled");
          cy.contains(lockedRowMessage);
        });

        cy.visit(`/admin/screenings/${screeningId}`);
        cy.contains(lockedRowMessage);
        cy.get("fieldset").should("have.attr", "disabled");
        cy.contains("button", "Save changes").should("not.exist");
      });
    });
  });

  it("hides a movie and removes it from customer views", () => {
    const title = `E2E hidden movie ${Date.now()}`;
    const time = timeFor(13);
    let movieId;
    let screeningId;

    cy.visit("/admin/movies/new");
    logIn("admin@rio.test");
    cy.get("#movie-title").type(title);
    cy.get("#movie-durationMinutes").type("105");
    cy.contains("label", "Visible to customers").find("input").check();
    cy.contains("button", "Create movie").click();
    cy.location("pathname").should("match", /^\/admin\/movies\/\d+$/);
    cy.location("pathname").then((pathname) => {
      movieId = Number(pathname.split("/").pop());

      cy.visit("/admin/screenings/new");
      fillScreening({ movieId, time, price: "10", published: true });
      cy.intercept("POST", "**/api/admin/screenings").as("createHiddenMovieScreening");
      cy.contains("button", "Create screening").click();
      cy.wait("@createHiddenMovieScreening").its("response.statusCode").should("eq", 201);
      cy.location("pathname").then((screeningPath) => {
        screeningId = Number(screeningPath.split("/").pop());
        cy.visit(`/movies?city=oulu`);
        cy.contains("a", title).should("be.visible");

        cy.visit(`/admin/movies?q=${encodeURIComponent(title)}`);
        cy.contains('table [data-testid="movie-row"]', title).within(() => {
          cy.contains("button", "Hide").click();
          cy.contains("Hidden");
        });

        cy.visit("/movies?city=oulu");
        cy.contains("a", title).should("not.exist");

        cy.visit(`/screenings/${screeningId}?city=oulu`);
        cy.contains("h1", "Screening not found");
      });
    });
  });
});
