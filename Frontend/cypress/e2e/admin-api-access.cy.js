const API_URL = "http://127.0.0.1:3000";

function loginToken(email) {
  return cy.env(["SEED_PASSWORD"], { log: false }).then(({ SEED_PASSWORD }) =>
    cy.request({
      method: "POST",
      url: `${API_URL}/api/auth/login`,
      body: { email, password: SEED_PASSWORD ?? "Rio-demo-2026" },
    }).then((response) => response.body.token),
  );
}

describe("Admin API access", () => {
  it("requires admin authentication for the movies API", () => {
    cy.request({
      method: "GET",
      url: `${API_URL}/api/admin/movies`,
      failOnStatusCode: false,
    }).then((response) => {
      expect(response.status).to.eq(401);
      expect(response.body.error.code).to.eq("UNAUTHORIZED");
    });

    loginToken("cashier.oulu@rio.test").then((cashierToken) => {
      cy.request({
        method: "GET",
        url: `${API_URL}/api/admin/movies`,
        headers: { Authorization: `Bearer ${cashierToken}` },
        failOnStatusCode: false,
      }).then((response) => {
        expect(response.status).to.eq(403);
        expect(response.body.error.code).to.eq("FORBIDDEN");
      });
    });

    loginToken("admin@rio.test").then((adminToken) => {
      cy.request({
        method: "GET",
        url: `${API_URL}/api/admin/movies`,
        headers: { Authorization: `Bearer ${adminToken}` },
      }).its("status").should("eq", 200);
    });
  });

  it("blocks cashier screening creation and creates nothing", () => {
    loginToken("admin@rio.test").then((adminToken) => {
      cy.request({
        method: "GET",
        url: `${API_URL}/api/admin/movies`,
        headers: { Authorization: `Bearer ${adminToken}` },
      }).then((moviesResponse) => {
        const movie = moviesResponse.body.find((item) => item.published);
        expect(movie).to.exist;

        cy.request({
          method: "GET",
          url: `${API_URL}/api/admin/halls`,
          headers: { Authorization: `Bearer ${adminToken}` },
        }).then((hallsResponse) => {
          const hall = hallsResponse.body.find((item) => item.theatre.city === "oulu");
          expect(hall).to.exist;

          loginToken("cashier.oulu@rio.test").then((cashierToken) => {
            const startsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000).toISOString();
            cy.request({
              method: "POST",
              url: `${API_URL}/api/admin/screenings`,
              headers: { Authorization: `Bearer ${cashierToken}` },
              body: {
                movieId: movie.id,
                hallId: hall.id,
                startsAt,
                basePrice: 10,
                isPremiere: false,
                published: false,
              },
              failOnStatusCode: false,
            }).then((response) => {
              expect(response.status).to.eq(403);
              expect(response.body.error.code).to.eq("FORBIDDEN");
            });

            cy.request({
              method: "GET",
              url: `${API_URL}/api/admin/screenings?from=${
                new Date().toISOString().slice(0, 10)
              }&to=${new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)}`,
              headers: { Authorization: `Bearer ${adminToken}` },
            }).then((screeningsResponse) => {
              expect(screeningsResponse.body.some((item) => item.startsAt === startsAt)).to.eq(false);
            });
          });
        });
      });
    });
  });

  it("redirects an invalid-token visitor from admin to staff login", () => {
    cy.visit("/admin/movies", {
      onBeforeLoad(win) {
        win.localStorage.setItem("rio-token", "invalid-expired-token");
      },
    });
    cy.location("pathname").should("eq", "/staff/login");
  });
});
