import { useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";
import { homeForRole, safeRedirect } from "../utils/redirect.js";

const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-wait disabled:opacity-50";
const INPUT_CLASSES =
  "w-full rounded-lg border border-rio-gold/40 bg-rio-black px-3 py-2 text-white focus:border-rio-gold";
const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "Wrong e-mail or password.",
};

function StaffLoginPage() {
  const { user, status, login } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [alert, setAlert] = useState(null);

  if (status === "authenticated") {
    return <Navigate to={safeRedirect(searchParams.get("redirect")) ?? homeForRole(user.role)} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setFieldErrors({});
    setAlert(null);
    try {
      await login({ email: email.trim(), password });
    } catch (error) {
      const fields = error.code === "VALIDATION_ERROR" ? error.details?.fields : null;
      if (fields) setFieldErrors(fields);
      else setAlert(ERROR_MESSAGES[error.code] ?? error.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="font-display text-3xl font-bold text-rio-gold">Staff login</h1>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        {alert && (
          <p role="alert" className="text-sm text-red-300">
            {alert}
          </p>
        )}

        <div className="space-y-1">
          <label htmlFor="staff-email" className="block text-sm font-semibold text-rio-gold-light">
            E-mail
          </label>
          <input
            id="staff-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? "staff-email-error" : undefined}
            className={INPUT_CLASSES}
          />
          {fieldErrors.email && (
            <p id="staff-email-error" className="text-sm text-red-300">
              {fieldErrors.email}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label htmlFor="staff-password" className="block text-sm font-semibold text-rio-gold-light">
            Password
          </label>
          <input
            id="staff-password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
            aria-describedby={fieldErrors.password ? "staff-password-error" : undefined}
            className={INPUT_CLASSES}
          />
          {fieldErrors.password && (
            <p id="staff-password-error" className="text-sm text-red-300">
              {fieldErrors.password}
            </p>
          )}
          <label className="flex items-center gap-2 pt-1 text-sm text-white/75">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
              className="accent-rio-gold"
            />
            Show password
          </label>
        </div>

        <button type="submit" disabled={submitting} className={`w-full ${GOLD_BUTTON_CLASSES}`}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}

export default StaffLoginPage;
