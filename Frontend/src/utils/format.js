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

const weekdayShortFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "short",
});

const fullDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const monthYearFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  month: "long",
  year: "numeric",
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

function addDays(dayKey, days) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Noon UTC falls on the same calendar day in Helsinki all year round.
function dayKeyToDate(dayKey) {
  return new Date(`${dayKey}T12:00:00Z`);
}

export function getUpcomingDayKeys(count, now = new Date()) {
  const todayKey = getDayKey(now);
  return Array.from({ length: count }, (_, index) => addDays(todayKey, index));
}

export function formatDayLabel(iso, now = new Date()) {
  const dayKey = getDayKey(iso);
  const todayKey = getDayKey(now);
  if (dayKey === todayKey) return "Today";
  if (dayKey === addDays(todayKey, 1)) return "Tomorrow";
  return dayLabelFormatter.format(new Date(iso));
}

export function formatWeekdayShort(dayKey) {
  return weekdayShortFormatter.format(dayKeyToDate(dayKey));
}

export function formatFullDate(dayKey) {
  return fullDateFormatter.format(dayKeyToDate(dayKey));
}

export function formatMonthYear(dayKey) {
  return monthYearFormatter.format(dayKeyToDate(dayKey));
}

export function getMonthGrid(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const firstKey = `${monthKey}-01`;
  const leadingBlanks = (dayKeyToDate(firstKey).getUTCDay() + 6) % 7;
  const dayCount = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: dayCount }, (_, index) => addDays(firstKey, index)),
  ];
}

export function addMonths(monthKey, months) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 7);
}

export function formatPrice(amount) {
  return priceFormatter.format(amount);
}
