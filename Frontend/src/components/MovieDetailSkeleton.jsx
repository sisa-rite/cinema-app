function MovieDetailSkeleton() {
  return (
    <div aria-hidden="true" className="motion-safe:animate-pulse">
      <div className="grid items-start gap-8 sm:grid-cols-[14rem_1fr] md:grid-cols-[18rem_1fr]">
        <div className="mx-auto aspect-2/3 w-full max-w-60 rounded-xl bg-white/10 sm:max-w-none" />
        <div className="space-y-4">
          <div className="h-9 w-2/3 rounded-sm bg-white/10" />
          <div className="h-4 w-1/3 rounded-sm bg-white/10" />
          <div className="h-4 w-full rounded-sm bg-white/10" />
          <div className="h-4 w-5/6 rounded-sm bg-white/10" />
        </div>
      </div>
      <div className="mt-12 space-y-3">
        <div className="h-7 w-56 rounded-sm bg-white/10" />
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="h-14 rounded-lg bg-white/10 md:w-1/2" />
        ))}
      </div>
    </div>
  );
}

export default MovieDetailSkeleton;
