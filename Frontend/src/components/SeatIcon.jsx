const STATE_STYLES = {
  available: { body: "fill-rio-surface stroke-rio-gold", number: "fill-rio-gold-light" },
  selected: {
    body: "fill-rio-gold stroke-rio-gold-light",
    number: "fill-rio-black",
    icon: "drop-shadow-[0_0_6px_rgb(242_196_109/0.7)]",
  },
  held: {
    body: "fill-transparent stroke-white/50 [stroke-dasharray:2.5_2]",
    number: "fill-white/60",
  },
  sold: { body: "fill-white/35 stroke-white/35", number: "fill-white" },
  owner: { body: "fill-rio-red stroke-rio-gold-deep", number: "fill-rio-gold-light" },
  blocked: { body: "fill-white/10 stroke-white/30", number: "fill-white/60" },
};

function SeatMark({ state }) {
  switch (state) {
    case "selected":
      return (
        <path
          d="M10 21.3l2.7 2.6 5.3-5.2"
          className="fill-none stroke-rio-black"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );
    case "sold":
      return (
        <path
          d="M11.2 18.7l5.6 5.2M16.8 18.7l-5.6 5.2"
          className="fill-none stroke-rio-black/80"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      );
    case "owner":
      return (
        <polygon
          points="14 17.6 14.94 20.01 17.52 20.16 15.52 21.79 16.17 24.29 14 22.9 11.83 24.29 12.48 21.79 10.48 20.16 13.06 20.01"
          className="fill-rio-gold"
        />
      );
    case "blocked":
      return (
        <path
          d="M4.5 22.5l4.5-5.5M6.5 25.5l7-8.5M11.5 25.5l7-8.5M16.5 25.5l7-8.5M21.5 25.5l3-3.7"
          className="fill-none stroke-white/45"
          strokeWidth="1.2"
        />
      );
    default:
      return null;
  }
}

function SeatIcon({ state, number, className = "" }) {
  const styles = STATE_STYLES[state];

  return (
    <svg
      viewBox="0 0 28 28"
      aria-hidden="true"
      focusable="false"
      className={`seat-icon h-full w-full overflow-visible ${styles.icon ?? ""} ${className}`}
    >
      <g className={`seat-body ${styles.body}`} strokeWidth="1.3">
        <rect x="1" y="10" width="3.5" height="14" rx="1.75" />
        <rect x="23.5" y="10" width="3.5" height="14" rx="1.75" />
        <rect x="5" y="1.5" width="18" height="14" rx="4" />
        <rect x="3.5" y="16.5" width="21" height="9.5" rx="2.5" />
      </g>
      <SeatMark state={state} />
      {number !== undefined && (
        <text
          x="14"
          y="9"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize="8.5"
          fontWeight="700"
          className={styles.number}
        >
          {number}
        </text>
      )}
    </svg>
  );
}

export default SeatIcon;
