import { useEffect, useId, useRef } from "react";
import { minimumAge } from "../utils/ageRating.js";
import AgeRatingBadge from "./AgeRatingBadge.jsx";

const CONFIRM = "confirm";
const PRIMARY_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light";
const SECONDARY_BUTTON_CLASSES =
  "rounded-full border border-rio-gold/60 px-6 py-2.5 font-semibold text-rio-gold transition-colors hover:border-rio-gold hover:bg-rio-gold/10";

// Native modal: the browser traps focus, closes on Esc and restores focus on close.
// Each increment of openRequest opens the dialog; closing is left entirely to the browser.
function AgeRatingDialog({ openRequest, rating, movieTitle, onConfirm, onCancel }) {
  const titleId = useId();
  const textId = useId();
  const dialogRef = useRef(null);
  const confirmRef = useRef(null);
  // Starts at the current value so a remount does not reopen an old request.
  const handledRequest = useRef(openRequest);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (openRequest === handledRequest.current) return;
    handledRequest.current = openRequest;
    if (!dialog.open) {
      dialog.returnValue = "";
      dialog.showModal();
      confirmRef.current.focus();
    }
  }, [openRequest]);

  // Esc, backdrop click and "Go back" all close without the confirm value.
  function handleClose() {
    if (dialogRef.current.returnValue === CONFIRM) onConfirm();
    else onCancel?.();
  }

  function handleBackdropClick(event) {
    if (event.target === dialogRef.current) dialogRef.current.close();
  }

  return (
    <dialog
      ref={dialogRef}
      data-testid="age-warning"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-rio-gold/40 bg-rio-surface p-0 text-white shadow-rio-glow backdrop:bg-rio-black/80"
    >
      <div className="relative space-y-4 p-6">
        <button
          type="button"
          onClick={() => dialogRef.current.close()}
          aria-label="Close"
          className="absolute top-3 right-3 grid size-9 place-items-center rounded-full text-rio-gold-light/80 transition-colors hover:bg-rio-gold/10 hover:text-rio-gold"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="size-5"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <h2
          id={titleId}
          className="flex flex-wrap items-center gap-3 pr-10 font-display text-xl font-bold text-rio-gold"
        >
          Age rating {rating}
          <AgeRatingBadge rating={rating} />
        </h2>
        <div id={textId} className="space-y-2 text-white/85">
          <p>
            “{movieTitle}” is rated <span className="whitespace-nowrap">{rating}</span>. It is not recommended for children under{" "}
            {minimumAge(rating)}.
          </p>
          <p>
            Our staff may check your ID at the entrance. Paid tickets cannot be refunded if
            you are not admitted.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-3">
          <button
            ref={confirmRef}
            type="button"
            onClick={() => dialogRef.current.close(CONFIRM)}
            className={PRIMARY_BUTTON_CLASSES}
          >
            I understand, continue
          </button>
          <button
            type="button"
            onClick={() => dialogRef.current.close()}
            className={SECONDARY_BUTTON_CLASSES}
          >
            Go back
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default AgeRatingDialog;
