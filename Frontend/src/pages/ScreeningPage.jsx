import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getScreeningSeats } from "../api/screenings.js";
import AgeRatingBadge from "../components/AgeRatingBadge.jsx";
import SeatLegend from "../components/SeatLegend.jsx";
import SeatMap from "../components/SeatMap.jsx";
import SelectionSummary from "../components/SelectionSummary.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { formatDayLabel, formatTime } from "../utils/format.js";

const MAX_SEATS = 10;
const CONTAINER_CLASSES = "mx-auto max-w-7xl px-4 py-8 sm:px-6";

function SeatSelection({ screening, seats }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const { movie, theatre, hall } = screening;

  const selectedSeats = seats
    .filter((seat) => selectedIds.includes(seat.id))
    .sort((a, b) => a.rowNumber - b.rowNumber || a.seatNumber - b.seatNumber);

  function toggleSeat(seatId) {
    setSelectedIds((ids) => {
      if (ids.includes(seatId)) return ids.filter((id) => id !== seatId);
      if (ids.length >= MAX_SEATS) return ids;
      return [...ids, seatId];
    });
  }

  return (
    <div className={CONTAINER_CLASSES}>
      <Link
        to={`/movies/${movie.id}?city=${theatre.city}`}
        className="rounded-sm text-sm font-semibold text-rio-gold underline-offset-4 hover:underline"
      >
        ← Back to {movie.title}
      </Link>

      <header className="mt-6 space-y-2">
        <h1 className="font-display text-3xl font-bold text-rio-gold sm:text-4xl">
          {movie.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-rio-gold-light">
          <time dateTime={screening.startsAt}>
            {formatDayLabel(screening.startsAt)} · {formatTime(screening.startsAt)}
          </time>
          {movie.ageRating && <AgeRatingBadge rating={movie.ageRating} />}
        </p>
        <p className="text-sm text-white/75">
          {theatre.name} · {hall.name}
        </p>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <section aria-labelledby="seat-selection-title" className="min-w-0 space-y-6">
          <h2
            id="seat-selection-title"
            className="text-center font-display text-xl font-bold text-rio-gold-light"
          >
            Choose your seats
          </h2>
          <SeatMap
            seats={seats}
            selectedIds={selectedIds}
            onToggle={toggleSeat}
            hallName={hall.name}
            maxSelected={MAX_SEATS}
          />
          <SeatLegend />
        </section>
        <SelectionSummary seats={selectedSeats} basePrice={screening.basePrice} />
      </div>
    </div>
  );
}

function ScreeningPage() {
  const { id } = useParams();

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, failed: false });
  const requestKey = `${id}#${attempt}`;

  useEffect(() => {
    const controller = new AbortController();
    getScreeningSeats(id, { signal: controller.signal })
      .then((data) => setResult({ key: requestKey, data, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, data: null, failed: true });
        }
      });
    return () => controller.abort();
  }, [id, requestKey]);

  if (result.key !== requestKey) {
    return (
      <div className={CONTAINER_CLASSES}>
        <p role="status" className="sr-only">
          Loading seats…
        </p>
        <div aria-hidden="true" className="mx-auto h-96 max-w-xl rounded-2xl bg-white/10 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (result.failed) {
    return (
      <StateMessage title="We couldn’t load the seats" headingAs="h1" role="alert">
        <p className="text-white/75">
          Something went wrong on our side or your connection dropped. Please
          try again in a moment.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((count) => count + 1)}
          className="rounded-full bg-rio-gold px-6 py-2 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light"
        >
          Try again
        </button>
      </StateMessage>
    );
  }

  return (
    <SeatSelection
      key={requestKey}
      screening={result.data.screening}
      seats={result.data.seats}
    />
  );
}

export default ScreeningPage;
