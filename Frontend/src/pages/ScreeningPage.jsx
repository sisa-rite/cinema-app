import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { createBooking } from "../api/bookings.js";
import { ApiError } from "../api/client.js";
import { getScreeningSeats } from "../api/screenings.js";
import AgeRatingBadge from "../components/AgeRatingBadge.jsx";
import SeatLegend from "../components/SeatLegend.jsx";
import SeatMap from "../components/SeatMap.jsx";
import SelectionSummary from "../components/SelectionSummary.jsx";
import StateMessage from "../components/StateMessage.jsx";
import { saveBookingEmail } from "../utils/bookingStorage.js";
import { formatDayLabel, formatTime } from "../utils/format.js";

const MAX_SEATS = 10;
const DEFAULT_TITLE = "Rio Theatres";
const NOT_FOUND_CODES = new Set(["SCREENING_NOT_FOUND", "INVALID_ID"]);
const CONTAINER_CLASSES = "mx-auto max-w-7xl px-4 py-8 sm:px-6";
const TEXT_LINK_CLASSES =
  "rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline";
const IDLE_HOLD = { submitting: false, fieldErrors: {}, alert: null };

const bySeatPosition = (a, b) => a.rowNumber - b.rowNumber || a.seatNumber - b.seatNumber;
const seatLabel = (seat) => `Row ${seat.rowNumber} · Seat ${seat.seatNumber}`;

function takenSeatsMessage(seats, takenIds) {
  const taken = new Set(takenIds);
  const names = seats.filter((seat) => taken.has(seat.id)).sort(bySeatPosition).map(seatLabel);
  if (names.length === 0) return "Sorry, someone was faster: some of your seats are no longer available.";
  const verb = names.length === 1 ? "is" : "are";
  return `Sorry, someone was faster: ${names.join(", ")} ${verb} no longer available.`;
}

function SeatSelection({ initialData, initialLoadedAt }) {
  const [data, setData] = useState({ ...initialData, loadedAt: initialLoadedAt });
  const [selection, setSelection] = useState({ ids: [], dropped: false });
  const [refreshStatus, setRefreshStatus] = useState("idle");
  const [hold, setHold] = useState(IDLE_HOLD);
  const [serverClosed, setServerClosed] = useState(false);
  const refreshController = useRef(null);
  const holdPending = useRef(false);
  const navigate = useNavigate();

  const { screening, seats } = data;
  const { movie, theatre, hall } = screening;
  const salesClosed = serverClosed || Date.parse(screening.startsAt) <= data.loadedAt;
  const screeningLabel = `${formatDayLabel(screening.startsAt)} ${formatTime(screening.startsAt)}`;

  const selectedSeats = seats
    .filter((seat) => selection.ids.includes(seat.id))
    .sort(bySeatPosition);

  useEffect(() => {
    document.title = `${movie.title} — ${screeningLabel} — ${DEFAULT_TITLE}`;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [movie.title, screeningLabel]);

  useEffect(() => () => refreshController.current?.abort(), []);

  function toggleSeat(seatId) {
    setHold((current) => (current.alert ? { ...current, alert: null } : current));
    setSelection(({ ids, dropped }) => {
      if (ids.includes(seatId)) return { ids: ids.filter((id) => id !== seatId), dropped };
      if (ids.length >= MAX_SEATS) return { ids, dropped };
      return { ids: [...ids, seatId], dropped };
    });
  }

  async function refreshSeats() {
    refreshController.current?.abort();
    const controller = new AbortController();
    refreshController.current = controller;
    setRefreshStatus("loading");

    try {
      const next = await getScreeningSeats(screening.id, { signal: controller.signal });
      const available = new Set(
        next.seats.filter((seat) => seat.state === "available").map((seat) => seat.id),
      );
      setData({ ...next, loadedAt: Date.now() });
      setSelection(({ ids }) => {
        const kept = ids.filter((id) => available.has(id));
        return { ids: kept, dropped: kept.length < ids.length };
      });
      setRefreshStatus("idle");
    } catch {
      if (!controller.signal.aborted) setRefreshStatus("failed");
    }
  }

  async function holdSeats(email) {
    if (holdPending.current) return;
    holdPending.current = true;
    setHold({ ...IDLE_HOLD, submitting: true });

    try {
      const booking = await createBooking({
        screeningId: screening.id,
        seatIds: selectedSeats.map((seat) => seat.id),
        email,
      });
      saveBookingEmail(booking.reference, email);
      navigate(`/checkout/${encodeURIComponent(booking.reference)}?city=${theatre.city}`);
    } catch (error) {
      holdPending.current = false;
      const code = error instanceof ApiError ? error.code : null;

      if (code === "SALES_CLOSED") {
        setHold(IDLE_HOLD);
        setServerClosed(true);
      } else if (code === "SEATS_UNAVAILABLE") {
        const takenIds = error.details?.seatIds ?? [];
        setHold({ ...IDLE_HOLD, alert: { text: takenSeatsMessage(seats, takenIds), retry: false } });
        setSelection(({ ids }) => ({ ids: ids.filter((id) => !takenIds.includes(id)), dropped: false }));
        refreshSeats();
      } else if (code === "VALIDATION_ERROR" && (error.details?.fields?.email || error.details?.fields?.seatIds)) {
        setHold({ ...IDLE_HOLD, fieldErrors: error.details.fields });
      } else {
        setHold({
          ...IDLE_HOLD,
          alert: { text: "We couldn’t hold your seats. Please try again.", retry: true },
        });
      }
    }
  }

  let refreshMessage = "";
  if (refreshStatus === "loading") refreshMessage = "Refreshing seats…";
  else if (refreshStatus === "failed") refreshMessage = "We couldn’t refresh the seats. Please try again.";
  else if (selection.dropped) refreshMessage = "Some of your selected seats are no longer available.";

  return (
    <div className={CONTAINER_CLASSES}>
      <Link to={`/movies/${movie.id}?city=${theatre.city}`} className={`text-sm ${TEXT_LINK_CLASSES}`}>
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

      <div
        className={`mt-8 grid gap-8 lg:items-start ${
          salesClosed ? "" : "lg:grid-cols-[minmax(0,1fr)_20rem]"
        }`}
      >
        <section aria-labelledby="seat-selection-title" className="min-w-0 space-y-6">
          <h2
            id="seat-selection-title"
            className="text-center font-display text-xl font-bold text-rio-gold-light"
          >
            {salesClosed ? "Seat map" : "Choose your seats"}
          </h2>
          {salesClosed ? (
            <p className="mx-auto max-w-xl rounded-lg border border-rio-gold bg-rio-gold/10 px-4 py-3 text-center font-semibold text-rio-gold-light">
              Sales for this screening are closed.
            </p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <p role="status" className="min-h-5 text-sm text-rio-gold-light">
                {refreshMessage}
              </p>
              <button
                type="button"
                onClick={refreshSeats}
                disabled={refreshStatus === "loading"}
                className={`ml-auto text-sm disabled:cursor-wait disabled:opacity-60 ${TEXT_LINK_CLASSES}`}
              >
                Refresh seats
              </button>
            </div>
          )}
          <SeatMap
            seats={seats}
            selectedIds={selection.ids}
            onToggle={toggleSeat}
            hallName={hall.name}
            maxSelected={MAX_SEATS}
            readOnly={salesClosed}
          />
          <SeatLegend />
        </section>
        {!salesClosed && (
          <SelectionSummary
            seats={selectedSeats}
            basePrice={screening.basePrice}
            onHold={holdSeats}
            submitting={hold.submitting}
            fieldErrors={hold.fieldErrors}
            alert={hold.alert}
          />
        )}
      </div>
    </div>
  );
}

function ScreeningPage() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, data: null, loadedAt: null, error: null });
  const requestKey = `${id}#${attempt}`;
  const isLoading = result.key !== requestKey;
  const apiCity = isLoading ? undefined : result.data?.screening.theatre.city;
  const urlCity = searchParams.get("city");

  useEffect(() => {
    const controller = new AbortController();
    getScreeningSeats(id, { signal: controller.signal })
      .then((data) =>
        setResult({ key: requestKey, data, loadedAt: Date.now(), error: null }),
      )
      .catch((error) => {
        if (!controller.signal.aborted) {
          setResult({ key: requestKey, data: null, loadedAt: null, error });
        }
      });
    return () => controller.abort();
  }, [id, requestKey]);

  useEffect(() => {
    if (apiCity && urlCity !== apiCity) {
      setSearchParams({ city: apiCity }, { replace: true });
    }
  }, [apiCity, urlCity, setSearchParams]);

  if (isLoading) {
    return (
      <div className={CONTAINER_CLASSES}>
        <p role="status" className="sr-only">
          Loading seats…
        </p>
        <div aria-hidden="true" className="mx-auto h-96 max-w-xl rounded-2xl bg-white/10 motion-safe:animate-pulse" />
      </div>
    );
  }

  if (result.error) {
    const isNotFound =
      result.error instanceof ApiError && NOT_FOUND_CODES.has(result.error.code);

    if (isNotFound) {
      return (
        <StateMessage title="Screening not found" headingAs="h1">
          <p className="text-white/75">
            This screening is not available. It may have been removed from the
            programme.
          </p>
          <Link to="/" className={TEXT_LINK_CLASSES}>
            Back to the home page →
          </Link>
        </StateMessage>
      );
    }

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
      initialData={result.data}
      initialLoadedAt={result.loadedAt}
    />
  );
}

export default ScreeningPage;
