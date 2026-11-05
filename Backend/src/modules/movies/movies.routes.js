import { Router } from "express";
import { getMovie, getMovies } from "./movies.service.js";

const router = Router();

router.get("/", async (req, res) => {
  const movies = await getMovies(req.query.city);
  res.status(200).json(
    movies.map((movie) => ({
      id: movie.id,
      title: movie.title,
      description: movie.description,
      durationMinutes: movie.duration_minutes,
      genre: movie.genre,
      ageRating: movie.age_rating,
      posterUrl: movie.poster_url,
    })),
  );
});

router.get("/:id", async (req, res) => {
  const movie = await getMovie(req.params.id, req.query.city);
  res.status(200).json({
    id: movie.id,
    title: movie.title,
    description: movie.description,
    durationMinutes: movie.duration_minutes,
    genre: movie.genre,
    ageRating: movie.age_rating,
    posterUrl: movie.poster_url,
    trailerUrl: movie.trailer_url,
    screenings: movie.screenings.map((screening) => ({
      id: screening.id,
      startsAt: new Date(screening.starts_at).toISOString(),
      theatreName: screening.theatre_name,
      hallName: screening.hall_name,
      basePrice: Number(screening.base_price),
      isPremiere: screening.is_premiere,
    })),
  });
});

export default router;
