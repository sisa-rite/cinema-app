// Runs against the real backend with the seeded admin account.
// The tests share one movie and run in order; it stays hidden, so customers never see it.
import { logIn } from "../support/staffLogin.js";

const title = `E2E movie ${Date.now()}`;
const listUrl = `/admin/movies?q=${encodeURIComponent(title)}`;
const hasBookingsMessage =
  "This movie has upcoming screenings with sold tickets and cannot be hidden.";

function visitAsAdmin(path) {
  cy.visit(path);
  logIn("admin@rio.test");
  cy.location().should(({ pathname, search }) => expect(`${pathname}${search}`).to.eq(path));
}

function movieRow(movieTitle) {
  return cy.contains('table [data-testid="movie-row"]', movieTitle);
}

describe("Admin movies", () => {
  it("creates an unpublished movie and finds it in the list", () => {
    cy.intercept("POST", "**/api/admin/movies").as("createMovie");
    visitAsAdmin("/admin/movies/new");
    cy.title().should("eq", "New movie — Admin — Rio Theatres");

    cy.get("#movie-title").type(title);
    cy.get("#movie-durationMinutes").type("100");
    cy.get("#movie-published").should("not.be.checked");
    cy.contains("Hidden movies and their screenings are not shown to customers.");
    cy.contains("button", "Create movie").click();

    cy.wait("@createMovie").its("response.statusCode").should("eq", 201);
    cy.location("pathname").should("match", /^\/admin\/movies\/\d+$/);
    cy.get('[role="status"]').should("have.text", "Movie created");
    cy.contains("h1", title);
    cy.title().should("eq", `${title} — Admin — Rio Theatres`);

    cy.contains("a", "← All movies").click();
    cy.location("pathname").should("eq", "/admin/movies");
    cy.get("#movie-search").type(title);
    cy.location("search").should("contain", "q=");
    cy.get('table [data-testid="movie-row"]').should("have.length", 1);
    movieRow(title).should("contain", "Hidden");
  });

  it("edits the movie and keeps the changes after reload", () => {
    visitAsAdmin(listUrl);
    movieRow(title).find("a").click();

    cy.contains("button", "Save changes").should("be.disabled");
    cy.get("#movie-durationMinutes").clear().type("125");
    cy.get("#movie-genre").clear().type("E2E genre");
    cy.contains("button", "Save changes").click();

    cy.get('[role="status"]').should("have.text", "Changes saved");
    cy.contains("button", "Save changes").should("be.disabled");

    cy.reload();
    cy.get("#movie-durationMinutes").should("have.value", "125");
    cy.get("#movie-genre").should("have.value", "E2E genre");
  });

  it("publishes and hides the movie from the list", () => {
    visitAsAdmin(listUrl);

    movieRow(title).within(() => {
      cy.contains("button", "Publish").click();
      cy.contains("Published");
      cy.contains("button", "Hide").click();
      cy.contains("Hidden");
      cy.contains("button", "Publish").should("be.enabled");
    });
  });

  it("shows a field error for an empty title without sending a request", () => {
    cy.intercept("POST", "**/api/admin/movies").as("createMovie");
    visitAsAdmin("/admin/movies/new");

    cy.contains("button", "Create movie").click();

    cy.get("#movie-title")
      .should("have.attr", "aria-invalid", "true")
      .and("have.attr", "aria-describedby", "movie-title-error")
      .and("have.focus");
    cy.get("#movie-title-error").should("have.text", "Enter a title");
    cy.get("@createMovie.all").should("have.length", 0);
  });

  it("explains why a movie with sold tickets cannot be hidden", () => {
    cy.intercept("PATCH", "**/api/admin/movies/*", {
      statusCode: 409,
      body: {
        error: {
          code: "MOVIE_HAS_BOOKINGS",
          message: "The movie has upcoming screenings with tickets.",
        },
      },
    }).as("hideMovie");
    visitAsAdmin("/admin/movies?status=published");

    cy.get('table [data-testid="movie-row"]')
      .first()
      .within(() => {
        cy.contains("button", "Hide").click();
        cy.wait("@hideMovie");
        cy.get('[role="alert"]').should("have.text", hasBookingsMessage);
        cy.contains("Published");
      });
  });
});
