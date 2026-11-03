import "dotenv/config";
import app from "./app.js";
import { migrate } from "./migrate.js";

const PORT = process.env.PORT || 3000;

try {
  await migrate();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
