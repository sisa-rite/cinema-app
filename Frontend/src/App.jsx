import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import HomePage from "./pages/HomePage.jsx";
import MoviesPage from "./pages/MoviesPage.jsx";
import MovieDetailPage from "./pages/MovieDetailPage.jsx";
import ScreeningPage from "./pages/ScreeningPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import CashierPage from "./pages/CashierPage.jsx";
import AdminPage from "./pages/AdminPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <HomePage /> },
      { path: "/movies", element: <MoviesPage /> },
      { path: "/movies/:id", element: <MovieDetailPage /> },
      { path: "/screenings/:id", element: <ScreeningPage /> },
      { path: "/checkout/:reference", element: <CheckoutPage /> },
      { path: "/cashier", element: <CashierPage /> },
      { path: "/admin", element: <AdminPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

function App() {
  return <RouterProvider router={router} />;
}

export default App;
