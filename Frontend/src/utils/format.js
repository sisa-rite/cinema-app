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

const dateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  day: "numeric",
  month: "short",
});

const offsetFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  timeZoneName: "longOffset",
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

export function formatDateTime(iso) {
  return dateTimeFormatter.format(new Date(iso));
}

export function getDayKey(iso) {
  const parts = Object.fromEntries(
    dayKeyFormatter
      .formatToParts(new Date(iso))
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(dayKey, days) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayKey(now = new Date()) {
  return getDayKey(now);
}

// "GMT+02:00" → "+02:00"
function helsinkiOffset(date) {
  const zoneName = offsetFormatter
    .formatToParts(date)
    .find((part) => part.type === "timeZoneName").value;
  return zoneName.slice(3);
}

function offsetToMinutes(offset) {
  const [hours, minutes] = offset.slice(1).split(":").map(Number);
  return (offset.startsWith("-") ? -1 : 1) * (hours * 60 + minutes);
}

// Helsinki wall-clock time → ISO with the Helsinki offset, whatever the browser's time zone.
// A time skipped or repeated by a DST change gets the winter offset +02:00: a skipped 03:30
// becomes 04:30 summer time, a repeated 03:30 means the second (winter time) one.
export function helsinkiDateTimeToIso(dayKey, time) {
  const [year, month, day] = dayKey.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = helsinkiOffset(new Date(wallClockAsUtc));
  const offset = helsinkiOffset(new Date(wallClockAsUtc - offsetToMinutes(firstOffset) * 60_000));
  return `${dayKey}T${time.slice(0, 5)}:00${offset}`;
}

export function isoToHelsinkiParts(iso) {
  return { dayKey: getDayKey(iso), time: formatTime(iso) };
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

export function formatShortDate(dayKey) {
  return shortDateFormatter.format(dayKeyToDate(dayKey));
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
