import SeatIcon from "./SeatIcon.jsx";

const LEGEND = [
  { state: "available", label: "Available" },
  { state: "selected", label: "Selected" },
  { state: "held", label: "Held by another customer" },
  { state: "sold", label: "Sold" },
  { state: "owner", label: "Owner’s seat" },
  { state: "blocked", label: "Not available" },
];

function SeatLegend() {
  return (
    <ul
      aria-label="Seat legend"
      className="seat-legend flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm text-white/80"
    >
      {LEGEND.map(({ state, label }) => (
        <li key={state} className="flex items-center gap-2">
          <span className="h-6 w-6 sm:h-7 sm:w-7">
            <SeatIcon state={state} />
          </span>
          {label}
        </li>
      ))}
    </ul>
  );
}

export default SeatLegend;
