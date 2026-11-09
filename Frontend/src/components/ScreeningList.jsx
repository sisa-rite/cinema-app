import { Link } from "react-router-dom";
import {
  formatDayLabel,
  formatPrice,
  formatTime,
  getDayKey,
} from "../utils/format.js";

function groupByDay(screenings) {
  const days = [];
  for (const screening of screenings) {
    const key = getDayKey(screening.startsAt);
    const lastDay = days.at(-1);
    if (lastDay?.key === key) {
      lastDay.screenings.push(screening);
    } else {
      days.push({
        key,
        label: formatDayLabel(screening.startsAt),
        screenings: [screening],
      });
    }
  }
  return days;
}

function ScreeningList({ screenings, city }) {
  return (
    <ul className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {groupByDay(screenings).map((day) => (
        <li key={day.key}>
          <section aria-labelledby={`day-${day.key}`}>
            <h3
              id={`day-${day.key}`}
              className="font-display text-lg font-bold text-rio-gold-light"
            >
              {day.label}
            </h3>
            <ul className="mt-3 space-y-2">
              {day.screenings.map((screening) => (
                <li key={screening.id}>
                  <Link
                    to={`/screenings/${screening.id}?city=${city}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-rio-gold/20 bg-rio-surface px-4 py-3 transition-colors hover:border-rio-gold hover:bg-rio-gold/10 focus-visible:border-rio-gold"
                  >
                    <div className="flex items-baseline gap-3">
                      <time
                        dateTime={screening.startsAt}
                        className="text-lg font-semibold text-white"
                      >
                        {formatTime(screening.startsAt)}
                      </time>
                      <span className="text-sm text-white/70">
                        {screening.hallName}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {screening.isPremiere && (
                        <span className="rounded-sm bg-rio-red px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-rio-gold">
                          Premiere
                        </span>
                      )}
                      <span className="text-sm font-semibold text-rio-gold-light">
                        {formatPrice(screening.basePrice)}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </li>
      ))}
    </ul>
  );
}

export default ScreeningList;
