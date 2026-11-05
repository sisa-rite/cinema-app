function AgeRatingBadge({ rating }) {
  return (
    <span className="rounded-sm bg-rio-red px-1.5 py-0.5 text-xs font-bold text-white">
      <span className="sr-only">Age rating </span>
      {rating}
    </span>
  );
}

export default AgeRatingBadge;
