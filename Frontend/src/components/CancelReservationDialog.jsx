import { useEffect, useId, useRef } from "react";

const CONFIRM = "confirm";
const CANCEL_BUTTON_CLASSES =
  "rounded-full bg-rio-red px-6 py-2.5 font-semibold text-white transition-colors hover:bg-rio-red-dark";
const SECONDARY_BUTTON_CLASSES =
  "rounded-full border border-rio-gold/60 px-6 py-2.5 font-semibold text-rio-gold transition-colors hover:border-rio-gold hover:bg-rio-gold/10";

// Native modal; "Keep it" gets focus because cancelling cannot be undone.
// Each increment of openRequest opens the dialog, like AgeRatingDialog: an "open" boolean would
// only reset in the asynchronous close event, so a quick second click could not reopen it.
function CancelReservationDialog({ openRequest, onConfirm }) {
  const titleId = useId();
  const textId = useId();
  const dialogRef = useRef(null);
  const keepRef = useRef(null);
  // Starts at the current value so a remount does not reopen an old request.
  const handledRequest = useRef(openRequest);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (openRequest === handledRequest.current) return;
    handledRequest.current = openRequest;
    if (!dialog.open) {
      dialog.returnValue = "";
      dialog.showModal();
      keepRef.current.focus();
    }
  }, [openRequest]);

  // Esc, backdrop click and "Keep it" all close without the confirm value.
  function handleClose() {
    if (dialogRef.current.returnValue === CONFIRM) onConfirm();
  }

  function handleBackdropClick(event) {
    if (event.target === dialogRef.current) dialogRef.current.close();
  }

  return (
    <dialog
      ref={dialogRef}
      data-testid="cancel-reservation-dialog"
      aria-labelledby={titleId}
      aria-describedby={textId}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-rio-gold/40 bg-rio-surface p-0 text-white shadow-rio-glow backdrop:bg-rio-black/80"
    >
      <div className="space-y-4 p-6">
        <h2 id={titleId} className="font-display text-xl font-bold text-rio-gold">
          Cancel this reservation?
        </h2>
        <p id={textId} className="text-white/85">
          The seats will be released.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-3">
          <button
            type="button"
            onClick={() => dialogRef.current.close(CONFIRM)}
            className={CANCEL_BUTTON_CLASSES}
          >
            Cancel reservation
          </button>
          <button
            ref={keepRef}
            type="button"
            onClick={() => dialogRef.current.close()}
            className={SECONDARY_BUTTON_CLASSES}
          >
            Keep it
          </button>
        </div>
      </div>
    </dialog>
  );
}

export default CancelReservationDialog;
