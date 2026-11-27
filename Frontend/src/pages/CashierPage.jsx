import { useAuth } from "../auth/useAuth.js";
import StaffHeader from "../components/StaffHeader.jsx";
import StateMessage from "../components/StateMessage.jsx";

function CashierPage() {
  const { user } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col">
      <StaffHeader homePath="/cashier" title="Rio Theatres — Cashier" />
      <main className="flex-1">
        <StateMessage title="Cashier view — coming soon" headingAs="h1">
          <p className="text-white/75">Logged in as {user.name}</p>
        </StateMessage>
      </main>
    </div>
  );
}

export default CashierPage;
