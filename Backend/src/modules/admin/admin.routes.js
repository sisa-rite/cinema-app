import { Router } from "express";
import { requireRole } from "../../middleware/auth.js";
import {
  createMovie,
  getMovie,
  listMovies,
  updateMovie,
} from "./adminMovies.service.js";
import {
  createScreening,
  deleteScreening,
  getScreening,
  listHalls,
  listScreenings,
  updateScreening,
} from "./adminScreenings.service.js";

const router = Router();

router.use(requireRole("admin"));

router.get("/movies", async (_req, res) => {
  const movies = await listMovies();
  res.status(200).json(movies);
});

router.get("/movies/:id", async (req, res) => {
  const movie = await getMovie(req.params.id);
  res.status(200).json(movie);
});

router.post("/movies", async (req, res) => {
  const movie = await createMovie(req.body);
  res.status(201).json(movie);
});

router.patch("/movies/:id", async (req, res) => {
  const movie = await updateMovie(req.params.id, req.body);
  res.status(200).json(movie);
});

router.get("/halls", async (_req, res) => {
  const halls = await listHalls();
  res.status(200).json(halls);
});

router.get("/screenings", async (req, res) => {
  const screenings = await listScreenings(req.query);
  res.status(200).json(screenings);
});

router.get("/screenings/:id", async (req, res) => {
  const screening = await getScreening(req.params.id);
  res.status(200).json(screening);
});

router.post("/screenings", async (req, res) => {
  const screening = await createScreening(req.body);
  res.status(201).json(screening);
});

router.patch("/screenings/:id", async (req, res) => {
  const screening = await updateScreening(req.params.id, req.body);
  res.status(200).json(screening);
});

router.delete("/screenings/:id", async (req, res) => {
  await deleteScreening(req.params.id);
  res.status(204).end();
});

export default router;
