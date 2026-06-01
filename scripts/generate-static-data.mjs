import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildFortune, readConfig, signs, todayInZone } from "../server.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, "public", "data");

const config = await readConfig();
const date = todayInZone(config.timezone);
const fortunes = {};

for (const sign of Object.keys(signs)) {
  fortunes[sign] = await buildFortune(sign, date, true);
}

await mkdir(dataDir, { recursive: true });
await writeFile(path.join(dataDir, "fortune.json"), `${JSON.stringify({
  date,
  timezone: config.timezone,
  generatedAt: new Date().toISOString(),
  fortunes
}, null, 2)}\n`, "utf8");

console.log(`Generated static fortune data for ${Object.keys(fortunes).length} signs on ${date}.`);
