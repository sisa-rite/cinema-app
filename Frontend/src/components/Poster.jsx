import { useState } from "react";

function Poster({ src, title, className = "" }) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <div
      className={`aspect-2/3 overflow-hidden rounded-xl border border-rio-gold/30 bg-rio-surface ${className}`}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
      ) : (
        <div
          aria-hidden="true"
          className="m-2 flex h-[calc(100%-1rem)] items-center justify-center rounded-lg border-2 border-double border-rio-gold/60 bg-linear-to-b from-rio-red-dark to-rio-black p-4 text-center font-display text-lg font-bold text-rio-gold-light"
        >
          {title}
        </div>
      )}
    </div>
  );
}

export default Poster;
