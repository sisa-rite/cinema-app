import { useEffect, useId, useRef } from "react";
import { formatHall, formatTimeRange } from "../utils/adminScreenings.js";
import { formatDayLabel } from "../utils/format.js";

const CONFIRM = "confirm";
const DELETE_BUTTON_CLASSES =
  "rounded-full bg-rio-red px-6 py-2.5 font-semibold text-white transition-colors hover:bg-rio-red-dark";
const SECONDARY_BUTTON_CLASSES =
  "rounded-full border border-rio-gold/60 px-6 py-2.5 font-semibold text-rio-gold transition-colors hover:border-rio-gold hover:bg-rio-gold/10";

// Native modal like AgeRatingDialog; "Keep it" gets focus because deleting cannot be undone.
function DeleteScreeningDialog({ screening, onConfirm, onCancel }) {
  const titleId = useId();
  const textId = useId();
  const dialogRef = useRef(null);
  const keepRef = useRef(null);
  const open = screening !== null;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (open && !dialog.open) {
      dialog.returnValue = "";
      dialog.showModal();
      keepRef.current.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Esc, backdrop click and "Keep it" all close without the confirm value.
  function handleClose() {
    if (dialogRef.current.returnValue === CONFIRM) onConfirm(screening);
    else onCancel();
  }

  function handleBackdropClick(event) {
    if (event.target === dialogRef.current) dialogRef.current.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onClose={handleClose}
      onClick={handleBackdropClick}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-rio-gold/40 bg-rio-surface p-0 text-white shadow-rio-glow backdrop:bg-rio-black/80"
    >
      {screening && (
        <div className="space-y-4 p-6">
          <h2 id={titleId} className="font-display text-xl font-bold text-rio-gold">
            Delete screening?
          </h2>
          <div id={textId} className="space-y-1 text-white/85">
            <p className="font-semibold text-rio-gold-light">{screening.movie.title}</p>
            <p>
              {formatDayLabel(screening.startsAt)} · {formatTimeRange(screening)}
            </p>
            <p>{formatHall(screening)}</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start sm:gap-3">
            <button
              type="button"
              onClick={() => dialogRef.current.close(CONFIRM)}
              className={DELETE_BUTTON_CLASSES}
            >
              Delete
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
      )}
    </dialog>
  );
}

export default DeleteScreeningDialog;
