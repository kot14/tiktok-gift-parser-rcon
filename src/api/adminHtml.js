// src/api/adminHtml.js
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function adminHtml() {
  const htmlPath = join(__dirname, "admin.html");
  return readFileSync(htmlPath, "utf-8");
}

