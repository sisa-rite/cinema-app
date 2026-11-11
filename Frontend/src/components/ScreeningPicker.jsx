import { Link, useSearchParams } from "react-router-dom";
import DateCalendar from "./DateCalendar.jsx";
import {
  formatFullDate,
  formatPrice,
  formatTime,
  formatWeekdayShort,
  getDayKey,
  getUpcomingDayKeys,
} from "../utils/format.js";

const DAY_COUNT = 7;

function groupBy(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

function DayPicker({ days, selectedKey, onSelect }) {
  return (
    <div role="group" aria-label="Choose a day" className="-ml-1.5 flex flex-wrap items-center sm:-ml-2.5">
      {days.map((day, index) => {
        const isSelected = day.key === selectedKey;
        const count = day.screenings.length;
        const stateClasses = isSelected
          ? "text-rio-gold underline decoration-2 underline-offset-8"
          : count > 0
            ? "text-white hover:text-rio-gold-light"
            : "cursor-not-allowed text-white/30";

        return (
          <button
            key={day.key}
            type="button"
            disabled={count === 0}
            aria-pressed={isSelected}
            aria-label={`${formatFullDate(day.key)}, ${
              count === 0 ? "no screenings" : `${count} ${count === 1 ? "screening" : "screenings"}`
            }`}
            onClick={() => onSelect(day.key)}
            className={`rounded-sm px-1.5 py-1 text-base font-semibold transition-colors motion-reduce:transition-none sm:px-2.5 sm:text-xl ${stateClasses}`}
          >
            {index === 0 ? "Today" : formatWeekdayShort(day.key)}
          </button>
        );
      })}
    </div>
  );
}

function Showtime({ screening, city }) {
  return (
    <Link
      to={`/screenings/${screening.id}?city=${city}`}
      className="relative flex min-w-28 flex-col items-center rounded-xl border border-rio-gold/30 bg-rio-surface px-5 pt-4 pb-3 transition hover:-translate-y-0.5 hover:border-rio-gold hover:shadow-rio-glow focus-visible:border-rio-gold motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      {screening.isPremiere && (
        <span className="absolute -top-2.5 rounded-sm bg-rio-red px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-rio-gold">
          Premiere
        </span>
      )}
      <time dateTime={screening.startsAt} className="font-display text-2xl font-bold text-white">
        {formatTime(screening.startsAt)}
      </time>
      <span className="mt-1 text-sm font-semibold text-rio-gold-light">
        {formatPrice(screening.basePrice)}
      </span>
    </Link>
  );
}

function ScreeningPicker({ screenings, city }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const screeningsByDay = groupBy(screenings, (screening) => getDayKey(screening.startsAt));
  const days = getUpcomingDayKeys(DAY_COUNT).map((key) => ({
    key,
    screenings: screeningsByDay.get(key) ?? [],
  }));
  const todayKey = days[0].key;
  const availableKeys = [...screeningsByDay.keys()].filter((key) => key >= todayKey).sort();
  const lastKey = availableKeys.at(-1);

  const requestedKey = searchParams.get("date");
  const selectedKey = availableKeys.includes(requestedKey)
    ? requestedKey
    : (days.find((day) => day.screenings.length > 0)?.key ?? availableKeys[0]);
  const selectedScreenings = screeningsByDay.get(selectedKey) ?? [];
  const hasLaterDates = lastKey > days.at(-1).key;

  function selectDay(key) {
    setSearchParams(
      (params) => {
        params.set("date", key);
        return params;
      },
      { replace: true },
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative flex flex-wrap items-center">
        <DayPicker days={days} selectedKey={selectedKey} onSelect={selectDay} />
        {hasLaterDates && (
          <DateCalendar
            counts={new Map([...screeningsByDay].map(([key, items]) => [key, items.length]))}
            todayKey={todayKey}
            lastKey={lastKey}
            selectedKey={selectedKey}
            isActive={!days.some((day) => day.key === selectedKey)}
            onSelect={selectDay}
          />
        )}
      </div>

      {selectedKey && (
        <section aria-labelledby="showtimes-title" className="space-y-6">
          <h3
            id="showtimes-title"
            className="font-display text-xl font-bold text-rio-gold-light"
          >
            {formatFullDate(selectedKey)}
          </h3>
          {[...groupBy(selectedScreenings, (screening) => screening.hallName)]
            .sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true }))
            .map(([hallName, hallScreenings]) => (
              <div key={hallName}>
                <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                  {hallName}
                </h4>
                <ul className="mt-4 flex flex-wrap gap-3">
                  {hallScreenings.map((screening) => (
                    <li key={screening.id}>
                      <Showtime screening={screening} city={city} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}

export default ScreeningPicker;
