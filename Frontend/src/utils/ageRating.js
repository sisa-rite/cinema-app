// FR-010: every rating except S (and no rating) needs the ID-check warning.
const RATINGS_WITH_AGE_CHECK = new Set(["K-7", "K-12", "K-16", "K-18"]);

export function requiresAgeCheck(ageRating) {
  return RATINGS_WITH_AGE_CHECK.has(ageRating);
}

// "K-12" → 12
export function minimumAge(ageRating) {
  return Number(ageRating.slice(2));
}
