import { Link, useSearchParams } from "react-router-dom";
import { THEATRES } from "../config/theatres.js";

function CitySwitcher() {
  const [searchParams] = useSearchParams();
  const currentCity = searchParams.get("city");

  return (
    <nav aria-label="Choose cinema">
      <ul className="flex gap-2">
        {THEATRES.map(({ city, label }) => {
          const isActive = city === currentCity;
          return (
            <li key={city}>
              <Link
                to={`/movies?city=${city}`}
                aria-current={isActive ? "page" : undefined}
                className={`block rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
                  isActive
                    ? "border-rio-gold bg-rio-gold text-rio-black"
                    : "border-rio-gold/40 text-rio-gold-light hover:border-rio-gold hover:text-rio-gold"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default CitySwitcher;
