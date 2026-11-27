import { useEffect, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.js";
import TextField from "../components/TextField.jsx";
import { customerLoginTarget, withRedirect } from "../utils/redirect.js";

const PAGE_TITLE = "Sign up — Rio Theatres";
const DEFAULT_TITLE = "Rio Theatres";
const GOLD_BUTTON_CLASSES =
  "rounded-full bg-rio-gold px-6 py-2.5 font-semibold text-rio-black transition-colors hover:bg-rio-gold-light disabled:cursor-wait disabled:opacity-50";
const TEXT_LINK_CLASSES =
  "rounded-sm font-semibold text-rio-gold underline-offset-4 hover:underline";

function SignUpPage() {
  const { user, status, register } = useAuth();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get("redirect");
  const loginPath = withRedirect("/login", redirect);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [emailTaken, setEmailTaken] = useState(false);
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
    setEmailTaken(false);
    setAlert(null);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
    } catch (error) {
      const fields = error.code === "VALIDATION_ERROR" ? error.details?.fields : null;
      if (fields) setFieldErrors(fields);
      else if (error.code === "EMAIL_TAKEN") setEmailTaken(true);
      else setAlert(error.message);
      setSubmitting(false);
    }
  }

  const emailError = emailTaken ? (
    <>
      An account with this e-mail already exists.{" "}
      <Link to={loginPath} className={TEXT_LINK_CLASSES}>
        Log in instead
      </Link>
    </>
  ) : (
    fieldErrors.email
  );

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="font-display text-3xl font-bold text-rio-gold">Sign up</h1>
      <p className="mt-2 text-white/75">
        Already have an account?{" "}
        <Link to={loginPath} className={TEXT_LINK_CLASSES}>
          Log in
        </Link>
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 space-y-5">
        {alert && (
          <p role="alert" className="text-sm text-red-300">
            {alert}
          </p>
        )}

        <TextField
          id="signup-name"
          label="Name"
          autoComplete="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
        />

        <TextField
          id="signup-email"
          label="E-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={emailError}
        />

        <TextField
          id="signup-password"
          label="Password"
          hint="At least 8 characters."
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
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
          {submitting ? "Creating your account…" : "Sign up"}
        </button>
      </form>
    </div>
  );
}

export default SignUpPage;
