import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";

const envPath = path.resolve(process.cwd(), ".env");
const examplePath = path.resolve(process.cwd(), ".env.example");

function setSecret(content, secret, replaceNonEmpty = false) {
  const parsed = parse(content);
  if (!replaceNonEmpty && parsed.JWT_SECRET) {
    return content;
  }

  const assignmentPattern =
    /^[ \t]*(?:export[ \t]+)?JWT_SECRET[ \t]*=[ \t]*[^\r\n]*(?:\r?\n|$)/gm;
  const assignments = [...content.matchAll(assignmentPattern)];
  const lastAssignment = assignments.at(-1);

  if (lastAssignment) {
    const updatedLine = lastAssignment[0].replace(
      /(=[ \t]*)[^\r\n]*(\r?\n|$)/,
      `$1${secret}$2`,
    );
    return (
      content.slice(0, lastAssignment.index) +
      updatedLine +
      content.slice(lastAssignment.index + lastAssignment[0].length)
    );
  }

  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
  const separator =
    content.length > 0 && !content.endsWith("\n") && !content.endsWith("\r")
      ? lineEnding
      : "";
  return `${content}${separator}JWT_SECRET=${secret}${lineEnding}`;
}

async function setup() {
  let existingContent;
  try {
    existingContent = await readFile(envPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }

    const example = await readFile(examplePath, "utf8");
    const content = setSecret(example, randomBytes(32).toString("hex"), true);
    await writeFile(envPath, content);
    console.log("Created Backend/.env with a new JWT_SECRET");
    return;
  }

  const existingSecret = parse(existingContent).JWT_SECRET;
  if (existingSecret) {
    console.log("Backend/.env is already set up");
    return;
  }

  const content = setSecret(existingContent, randomBytes(32).toString("hex"));
  await writeFile(envPath, content);
  console.log(
    existingSecret === undefined
      ? "Added JWT_SECRET to Backend/.env"
      : "Generated JWT_SECRET in Backend/.env",
  );
}

await setup();
