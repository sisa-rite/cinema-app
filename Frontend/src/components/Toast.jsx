import { useEffect } from "react";

const DISMISS_AFTER_MS = 4000;

// The live region stays mounted so screen readers announce every new message.
function Toast({ message, onDismiss }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(onDismiss, DISMISS_AFTER_MS);
    return () => clearTimeout(timer);
  }, [message, onDismiss]);

  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4"
    >
      {message && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-rio-gold bg-rio-surface py-2 pr-2 pl-4 font-semibold text-rio-gold-light shadow-rio-glow">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-5 shrink-0 text-rio-gold"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M7.5 12.5l3 3 6-6" />
          </svg>
          <span>{message}</span>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="rounded-full p-1 text-rio-gold-light transition-colors hover:text-rio-gold"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="size-4"
            >
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

export default Toast;
