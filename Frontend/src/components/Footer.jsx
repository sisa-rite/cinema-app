import { THEATRES } from "../config/theatres.js";

function Footer() {
  return (
    <footer className="border-t border-rio-gold/30 bg-rio-surface">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <ul className="grid gap-8 sm:grid-cols-2">
          {THEATRES.map((theatre) => (
            <li key={theatre.city}>
              <h2 className="font-display text-lg font-bold tracking-wide text-rio-gold">
                {theatre.name}
              </h2>
              <address className="mt-2 space-y-1 text-sm not-italic text-white/75">
                <p>{theatre.address}</p>
                <p>
                  <a
                    href={`tel:${theatre.phone.replaceAll(" ", "")}`}
                    className="rounded-sm text-rio-gold-light underline-offset-4 hover:underline"
                  >
                    {theatre.phone}
                  </a>
                </p>
              </address>
            </li>
          ))}
        </ul>
        <p className="mt-10 text-xs text-white/60">
          © 2026 Rio Theatres — family-run cinemas in Oulu and Tampere
        </p>
      </div>
    </footer>
  );
}

export default Footer;
