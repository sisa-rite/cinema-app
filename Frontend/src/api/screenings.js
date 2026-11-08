// Mock until GET /api/screenings/:id/seats is available; swap the body for
// apiGet(`/api/screenings/${encodeURIComponent(id)}/seats`, { signal }).
export async function getScreeningSeats(id, { hall, signal } = {}) {
  const { default: data } =
    hall === "200"
      ? await import("../mocks/screening-seats-200.json")
      : await import("../mocks/screening-seats.json");
  signal?.throwIfAborted();
  return { ...data, screening: { ...data.screening, id: Number(id) } };
}
