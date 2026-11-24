import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router-dom";
import AuthProvider from "./auth/AuthProvider.jsx";
import RequireRole from "./auth/RequireRole.jsx";
import Layout from "./components/Layout.jsx";
import AdminLayout from "./components/AdminLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import MoviesPage from "./pages/MoviesPage.jsx";
import MovieDetailPage from "./pages/MovieDetailPage.jsx";
import ScreeningPage from "./pages/ScreeningPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import StaffLoginPage from "./pages/StaffLoginPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignUpPage from "./pages/SignUpPage.jsx";
import CashierPage from "./pages/CashierPage.jsx";
import AdminMoviesPage from "./pages/AdminMoviesPage.jsx";
import AdminMovieFormPage from "./pages/AdminMovieFormPage.jsx";
import AdminScreeningsPage from "./pages/AdminScreeningsPage.jsx";
import AdminScreeningFormPage from "./pages/AdminScreeningFormPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

const router = createBrowserRouter([
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      {
        element: <Layout />,
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/movies", element: <MoviesPage /> },
          { path: "/movies/:id", element: <MovieDetailPage /> },
          { path: "/screenings/:id", element: <ScreeningPage /> },
          { path: "/checkout/:reference", element: <CheckoutPage /> },
          { path: "/login", element: <LoginPage /> },
          { path: "/signup", element: <SignUpPage /> },
          { path: "/staff/login", element: <StaffLoginPage /> },
          {
            path: "/cashier",
            element: (
              <RequireRole roles={["cashier", "admin"]}>
                <CashierPage />
              </RequireRole>
            ),
          },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
      {
        path: "/admin",
        element: (
          <RequireRole roles={["admin"]}>
            <AdminLayout />
          </RequireRole>
        ),
        children: [
          { index: true, element: <Navigate to="screenings" replace /> },
          { path: "movies", element: <AdminMoviesPage /> },
          { path: "movies/new", element: <AdminMovieFormPage /> },
          { path: "movies/:id", element: <AdminMovieFormPage /> },
          { path: "screenings", element: <AdminScreeningsPage /> },
          { path: "screenings/new", element: <AdminScreeningFormPage /> },
          { path: "screenings/:id", element: <AdminScreeningFormPage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
