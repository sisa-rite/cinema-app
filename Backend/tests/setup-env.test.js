import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../scripts/setup-env.js",
);

async function runSetup(directory) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: directory,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function withEnvDirectory(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "cinema-setup-"));
  try {
    await writeFile(
      path.join(directory, ".env.example"),
      "PORT=3000\nJWT_SECRET=\n",
    );
    await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("setup creates a random secret and leaves an initialized file unchanged", async () => {
  await withEnvDirectory(async (directory) => {
    const firstOutput = await runSetup(directory);
    const firstContent = await readFile(path.join(directory, ".env"), "utf8");
    const secret = firstContent.match(/^JWT_SECRET=([a-f0-9]{64})$/m)?.[1];

    assert.equal(firstOutput, "Created Backend/.env with a new JWT_SECRET");
    assert.ok(secret);
    assert.ok(!firstOutput.includes(secret));
    assert.equal(await runSetup(directory), "Backend/.env is already set up");
    assert.equal(await readFile(path.join(directory, ".env"), "utf8"), firstContent);
  });
});

test("setup adds a missing secret without changing existing lines", async () => {
  await withEnvDirectory(async (directory) => {
    const original = "PORT=3000\nCUSTOM=value\n";
    await writeFile(path.join(directory, ".env"), original);

    assert.equal(await runSetup(directory), "Added JWT_SECRET to Backend/.env");
    const updated = await readFile(path.join(directory, ".env"), "utf8");
    assert.ok(updated.startsWith(original));
    assert.match(updated, /(?:^|\n)JWT_SECRET=[a-f0-9]{64}\n$/);
  });
});

test("setup fills an empty secret while preserving other lines", async () => {
  await withEnvDirectory(async (directory) => {
    const original = "PORT=3000\nJWT_SECRET=\nCUSTOM=value\n";
    await writeFile(path.join(directory, ".env"), original);

    assert.equal(await runSetup(directory), "Generated JWT_SECRET in Backend/.env");
    const updated = await readFile(path.join(directory, ".env"), "utf8");
    assert.match(updated, /^PORT=3000\nJWT_SECRET=[a-f0-9]{64}\nCUSTOM=value\n$/);
  });
});
