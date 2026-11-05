import { Link } from "react-router-dom";
import logo from "../assets/rio-logo.webp";
import { THEATRES } from "../config/theatres.js";

function HomePage() {
  return (
    <section className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-16">
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgb(142_0_11/0.3),transparent_60%),radial-gradient(ellipse_at_center,transparent_55%,rgb(0_0_0/0.8))]"
      />

      <h1 className="w-full max-w-xl">
        <span className="rio-logo">
          <span aria-hidden="true" className="rio-logo-glow" />
          <img
            src={logo}
            alt="Rio Theatres — Oulu and Tampere"
            width="800"
            height="606"
            className="relative h-auto w-full"
          />
        </span>
      </h1>

      <h2 className="mt-12 font-display text-xl font-bold uppercase tracking-[0.2em] text-rio-gold-light sm:text-2xl">
        Choose your cinema
      </h2>

      <ul className="mt-8 grid w-full max-w-3xl gap-6 sm:grid-cols-2">
        {THEATRES.map((theatre) => (
          <li key={theatre.city}>
            <Link
              to={`/movies?city=${theatre.city}`}
              className="flex h-full flex-col items-center gap-3 rounded-2xl border border-rio-gold/30 bg-rio-surface/80 px-6 py-8 text-center transition hover:border-rio-gold hover:shadow-rio-glow focus-visible:border-rio-gold focus-visible:shadow-rio-glow"
            >
              <h3 className="font-display text-2xl font-bold text-rio-gold">
                {theatre.name}
              </h3>
              <p className="text-sm text-white/75">{theatre.address}</p>
              <span className="mt-2 text-sm font-semibold uppercase tracking-widest text-rio-gold-light">
                See what’s on →
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default HomePage;
