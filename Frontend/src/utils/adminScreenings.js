import { THEATRES } from "../config/theatres.js";
import { formatTime } from "./format.js";

export const ADS_MINUTES = 12;
export const LOCKED_ROW_MESSAGE = "Has tickets — cannot be changed";

export function hasTickets(screening) {
  return screening.ticketsSold + screening.ticketsHeld > 0;
}

export function formatTickets(screening) {
  return `${screening.ticketsSold} sold · ${screening.ticketsHeld} held`;
}

export function formatTimeRange(screening) {
  return `${formatTime(screening.startsAt)}–${formatTime(screening.endsAt)}`;
}

export function formatHall(screening) {
  return `${screening.hall.name} · ${screening.theatre.name}`;
}

export function lockedFormMessage(screening) {
  return `This screening has ${screening.ticketsSold} sold and ${screening.ticketsHeld} held tickets, so it cannot be changed, hidden or deleted.`;
}

// Theatres in the order of the halls list, labelled by city ("Oulu") when the city is known.
export function theatresFromHalls(halls) {
  const theatres = new Map();
  for (const { theatre } of halls) {
    if (theatres.has(theatre.id)) continue;
    const label = THEATRES.find((known) => known.city === theatre.city)?.label ?? theatre.name;
    theatres.set(theatre.id, { ...theatre, label });
  }
  return [...theatres.values()];
}
