import { useAuth } from "../auth/useAuth.js";
import StateMessage from "../components/StateMessage.jsx";

function CashierPage() {
  const { user, logout } = useAuth();

  return (
    <StateMessage title="Cashier view — coming soon" headingAs="h1">
      <p className="text-white/75">Logged in as {user.name}</p>
      <button
        type="button"
        onClick={logout}
        className="rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline"
      >
        Log out
      </button>
    </StateMessage>
  );
}

export default CashierPage;
