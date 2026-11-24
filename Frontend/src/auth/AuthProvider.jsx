import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getMe, login as loginRequest, register as registerRequest } from "../api/auth.js";
import { setUnauthorizedHandler } from "../api/client.js";
import { loadToken, removeToken, saveToken } from "./token.js";
import { AuthContext } from "./AuthContext.js";

function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(() => (loadToken() ? "loading" : "anonymous"));

  const clearSession = useCallback(() => {
    removeToken();
    setUser(null);
    setStatus("anonymous");
  }, []);

  // An expired token only clears the session; the route guard then sends staff to the login page.
  useEffect(() => {
    setUnauthorizedHandler(clearSession);
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    if (!loadToken()) return;
    const controller = new AbortController();
    getMe({ signal: controller.signal })
      .then(({ user: currentUser }) => {
        setUser(currentUser);
        setStatus("authenticated");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setStatus("anonymous");
      });
    return () => controller.abort();
  }, []);

  const startSession = useCallback(({ user: loggedInUser, token }) => {
    saveToken(token);
    setUser(loggedInUser);
    setStatus("authenticated");
    return loggedInUser;
  }, []);

  const login = useCallback(
    async (credentials) => startSession(await loginRequest(credentials)),
    [startSession],
  );

  const register = useCallback(
    async (account) => startSession(await registerRequest(account)),
    [startSession],
  );

  // Leave the protected page first (committed synchronously), so the route guard
  // does not see the cleared session and redirect to the login page.
  const logout = useCallback(async () => {
    await navigate("/", { flushSync: true });
    clearSession();
  }, [navigate, clearSession]);

  const value = useMemo(
    () => ({ user, status, login, register, logout }),
    [user, status, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default AuthProvider;
