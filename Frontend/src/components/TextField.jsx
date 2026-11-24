const INPUT_CLASSES =
  "w-full rounded-lg border border-rio-gold/40 bg-rio-black px-3 py-2 text-white focus:border-rio-gold";

function TextField({ id, label, hint, error, children, ...inputProps }) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-semibold text-rio-gold-light">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={INPUT_CLASSES}
        {...inputProps}
      />
      {hint && (
        <p id={hintId} className="text-sm text-white/70">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-red-300">
          {error}
        </p>
      )}
      {children}
    </div>
  );
}

export default TextField;
