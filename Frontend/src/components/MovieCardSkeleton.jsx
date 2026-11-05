function MovieCardSkeleton() {
  return (
    <li aria-hidden="true" className="flex flex-col gap-3 motion-safe:animate-pulse">
      <div className="aspect-2/3 rounded-xl bg-white/10" />
      <div className="h-4 w-3/4 rounded-sm bg-white/10" />
      <div className="h-3 w-1/2 rounded-sm bg-white/10" />
    </li>
  );
}

export default MovieCardSkeleton;
