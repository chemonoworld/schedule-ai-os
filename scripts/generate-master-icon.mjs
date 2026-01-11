#!/usr/bin/env node

import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SVG_PATH = path.join(ROOT_DIR, "assets/app-icon.svg");
const OUTPUT_PATH = path.join(ROOT_DIR, "assets/app-icon.png");

const svgContent = fs.readFileSync(SVG_PATH, "utf-8");
const resvg = new Resvg(svgContent, {
  fitTo: { mode: "width", value: 1024 },
});
const pngData = resvg.render();
fs.writeFileSync(OUTPUT_PATH, pngData.asPng());
console.log(`Generated: ${OUTPUT_PATH} (1024x1024)`);
