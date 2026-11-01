import { useEffect, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

function App() {
  const [api, setApi] = useState("checking…");
  const [db, setDb] = useState("checking…");

  useEffect(() => {
    fetch(`${API_URL}/api/health`)
      .then((res) => res.json())
      .then((data) => setApi(data.status))
      .catch(() => setApi("unreachable"));

    fetch(`${API_URL}/api/health/db`)
      .then((res) => res.json())
      .then((data) => setDb(data.database))
      .catch(() => setDb("unreachable"));
  }, []);

  return (
    <main className="min-h-screen bg-rio-black flex flex-col items-center justify-center gap-4">
      <h1 className="text-5xl font-bold text-gold">Rio Theatres</h1>
      <p className="text-white">Oulu · Tampere</p>
      <div className="border border-gold rounded-lg p-4 text-white">
        <p>
          API: <span className="text-gold">{api}</span>
        </p>
        <p>
          Database: <span className="text-gold">{db}</span>
        </p>
      </div>
    </main>
  );
}

export default App;
