import "dotenv/config";
import app from "./app.js";
import { migrate } from "./migrate.js";
import { startExpiryJob } from "./jobs/expiry.js";

const PORT = process.env.PORT || 3000;

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET must be set before the server can start.");
  process.exit(1);
}

try {
  await migrate();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

startExpiryJob();

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
