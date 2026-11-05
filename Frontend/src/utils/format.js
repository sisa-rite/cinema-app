const TIME_ZONE = "Europe/Helsinki";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const priceFormatter = new Intl.NumberFormat("fi-FI", {
  style: "currency",
  currency: "EUR",
});

export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

export function formatTime(iso) {
  return timeFormatter.format(new Date(iso));
}

export function getDayKey(iso) {
  const parts = Object.fromEntries(
    dayKeyFormatter
      .formatToParts(new Date(iso))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatDayLabel(iso, now = new Date()) {
  const dayKey = getDayKey(iso);
  const todayKey = getDayKey(now);
  if (dayKey === todayKey) return "Today";

  const tomorrow = new Date(`${todayKey}T00:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (dayKey === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";

  return dayLabelFormatter.format(new Date(iso));
}

export function formatPrice(amount) {
  return priceFormatter.format(amount);
}
