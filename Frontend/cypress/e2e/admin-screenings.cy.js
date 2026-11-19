// Runs against the real backend with the seeded admin account and movies.
// The tests share one screening and run in order; the delete test removes it again.
import { addDays, todayKey } from "../../src/utils/format.js";
import { logIn } from "../support/staffLogin.js";

// 40–59 days ahead, outside the seeded 14 days and different between repeated local runs.
const day = addDays(todayKey(), 40 + (Math.floor(Date.now() / 60_000) % 20));
const listUrl = `/admin/screenings?from=${day}`;
const startTime = "18:00";
const priceBeforePublishing = "Set a price greater than 0 € before publishing";
const lockedRowMessage = "Has tickets — cannot be changed";
let movieTitle;
let screeningId;

function visitAsAdmin(path) {
  cy.visit(path);
  logIn("admin@rio.test");
  cy.location().should(({ pathname, search }) => expect(`${pathname}${search}`).to.eq(path));
}

function fillScreening({ time, price, published = false }) {
  cy.get("#screening-movieId option").then((options) => {
    const option = [...options].find((item) => item.value && !item.text.endsWith("(hidden)"));
    movieTitle = option.text;
    cy.get("#screening-movieId").select(option.value);
  });
  cy.get("#screening-hallId option").then((options) => {
    cy.get("#screening-hallId").select([...options].find((item) => item.value).value);
  });
  cy.get("#screening-dayKey").type(day);
  cy.get("#screening-time").type(time);
  cy.get("#screening-basePrice").clear().type(price);
  if (published) cy.get("#screening-published").check();
}

function screeningRow() {
  return cy.contains('table [data-testid="screening-row"]', `${startTime}–`);
}

describe("Admin screenings", () => {
  it("creates an unpublished screening and shows it in the list", () => {
    cy.intercept("POST", "**/api/admin/screenings").as("createScreening");
    visitAsAdmin("/admin/screenings/new");
    cy.title().should("eq", "New screening — Admin — Rio Theatres");

    fillScreening({ time: startTime, price: "11.5" });
    cy.contains("Hall busy 17:48–");
    cy.contains("button", "Create screening").click();

    cy.wait("@createScreening").its("response.statusCode").should("eq", 201);
    cy.location("pathname").should("match", /^\/admin\/screenings\/\d+$/);
    cy.location("pathname").then((pathname) => {
      screeningId = Number(pathname.split("/").pop());
    });
    cy.get('[role="status"]').should("have.text", "Screening created");

    cy.visit(listUrl);
    cy.then(() => screeningRow().should("contain", movieTitle).and("contain", "Hidden"));
  });

  it("edits the price and keeps it after reload", () => {
    visitAsAdmin(`/admin/screenings/${screeningId}`);

    cy.contains("button", "Save changes").should("be.disabled");
    cy.get("#screening-basePrice").clear().type("13.25");
    cy.contains("button", "Save changes").click();
    cy.get('[role="status"]').should("have.text", "Changes saved");

    cy.reload();
    cy.get("#screening-basePrice").should("have.value", "13.25");
    cy.get("#screening-time").should("have.value", startTime);
  });

  it("publishes the screening from the list", () => {
    visitAsAdmin(listUrl);

    screeningRow().within(() => {
      cy.contains("button", "Publish").click();
      cy.contains("Published");
      cy.contains("button", "Hide").should("be.enabled");
    });
  });

  it("lists the overlapping screening when the hall is busy", () => {
    visitAsAdmin("/admin/screenings/new");

    fillScreening({ time: "18:30", price: "10" });
    cy.contains("button", "Create screening").click();

    cy.get('[role="alert"]')
      .should("contain", "This time overlaps another screening in the same hall")
      .find(`a[href="/admin/screenings/${screeningId}"]`)
      .should("have.text", movieTitle);
    cy.location("pathname").should("eq", "/admin/screenings/new");
  });

  it("locks a screening that has tickets", () => {
    cy.intercept({ method: "GET", pathname: "/api/admin/screenings" }, (request) => {
      // In dev, StrictMode aborts the first request; on("response") ignores aborted ones.
      // The faked body must not be cached, or the next test gets it back on a 304.
      delete request.headers["if-none-match"];
      request.on("response", (response) => {
        delete response.headers.etag;
        response.headers["cache-control"] = "no-store";
        response.body = response.body.map((screening) =>
          screening.id === screeningId ? { ...screening, ticketsSold: 3 } : screening,
        );
      });
    });
    visitAsAdmin(listUrl);

    screeningRow().within(() => {
      cy.contains("3 sold · 0 held");
      cy.contains("button", "Hide").should("be.disabled");
      cy.contains("button", "Delete").should("be.disabled");
      cy.contains(lockedRowMessage);
    });
  });

  it("deletes the screening after confirmation", () => {
    visitAsAdmin(listUrl);

    screeningRow().contains("button", "Delete").click();
    cy.get("dialog[open]").within(() => {
      cy.contains("h2", "Delete screening?");
      cy.contains(movieTitle);
      cy.contains("button", "Delete").click();
    });

    cy.get("dialog[open]").should("not.exist");
    cy.contains('[role="status"]', "Screening deleted");
    cy.contains('table [data-testid="screening-row"]', `${startTime}–`).should("not.exist");
  });

  it("asks for a price before publishing without sending a request", () => {
    cy.intercept("POST", "**/api/admin/screenings").as("createScreening");
    visitAsAdmin("/admin/screenings/new");

    fillScreening({ time: "21:00", price: "0", published: true });
    cy.contains("button", "Create screening").click();

    cy.get("#screening-basePrice")
      .should("have.attr", "aria-invalid", "true")
      .and("have.focus");
    cy.get("#screening-basePrice-error").should("have.text", priceBeforePublishing);
    cy.get("@createScreening.all").should("have.length", 0);
  });
});
