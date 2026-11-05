import { Link } from "react-router-dom";
import logo from "../assets/rio-logo.webp";
import CitySwitcher from "./CitySwitcher.jsx";

function Header() {
  return (
    <header className="border-b border-rio-gold/20 bg-rio-black">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <Link to="/" className="shrink-0 rounded-md">
          <img
            src={logo}
            alt="Rio Theatres — home"
            width="800"
            height="606"
            className="h-12 w-auto"
          />
        </Link>
        <CitySwitcher />
      </div>
    </header>
  );
}

export default Header;
