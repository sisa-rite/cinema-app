import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";
import TextField from "../components/TextField.jsx";
import { customerLoginTarget, withRedirect } from "../utils/redirect.js";

const PAGE_TITLE = "Log in — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-wait disabled:opacity-50";
const TEXT_LINK_CLASSES =
  "rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline";
const ERROR_MESSAGES = {
  INVALID_CREDENTIALS: "Wrong e-mail or password.",
};

function LoginPage() {
  const { user, status, login } = useAuth();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    document.title = PAGE_TITLE;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, []);

  if (status === "authenticated") {
    return <Navigate to={customerLoginTarget(user, redirect)} replace />;
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
      <h1 className="font-display text-3xl font-bold text-rio-gold">Log in</h1>
      <p className="mt-2 text-white/75">
        New to Rio Theatres?{" "}
        <Link to={withRedirect("/signup", redirect)} className={TEXT_LINK_CLASSES}>
          Sign up
        </Link>
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        {alert && (
          <p role="alert" className="text-sm text-red-300">
            {alert}
          </p>
        )}

        <TextField
          id="login-email"
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldErrors.email}
        />

        <TextField
          id="login-password"
          label="Password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
        >
          <label className="flex items-center gap-2 pt-1 text-sm text-white/75">
            <input
              type="checkbox"
              checked={showPassword}
              onChange={(event) => setShowPassword(event.target.checked)}
              className="accent-rio-gold"
            />
            Show password
          </label>
        </TextField>

        <button type="submit" disabled={submitting} className={`w-full ${GOLD_BUTTON_CLASSES}`}>
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </div>
  );
}

export default LoginPage;
