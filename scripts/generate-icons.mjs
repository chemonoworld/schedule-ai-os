#!/usr/bin/env node

/**
 * Generate app icons from SVG source
 * Usage: node scripts/generate-icons.mjs
 */

import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");
const SVG_PATH = path.join(ROOT_DIR, "assets/app-icon.svg");

// Output directories
const TAURI_ICONS_DIR = path.join(ROOT_DIR, "schedule-ai-tauri/src-tauri/icons");
const WEB_APP_DIR = path.join(ROOT_DIR, "schedule-ai-web/src/app");
const WEB_PUBLIC_DIR = path.join(ROOT_DIR, "schedule-ai-web/public");

// Icon sizes for Tauri (desktop)
const TAURI_SIZES = [32, 128, 256, 512];

// Icon sizes for web
const WEB_SIZES = [16, 32, 180, 192, 512];

async function svgToPng(svgContent, size) {
  const resvg = new Resvg(svgContent, {
    fitTo: {
      mode: "width",
      value: size,
    },
  });
  const pngData = resvg.render();
  return pngData.asPng();
}

async function generateIcons() {
  console.log("Reading SVG source...");
  const svgContent = fs.readFileSync(SVG_PATH, "utf-8");

  // Ensure directories exist
  [TAURI_ICONS_DIR, WEB_APP_DIR, WEB_PUBLIC_DIR].forEach((dir) => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Generate Tauri icons
  console.log("\n--- Tauri Desktop Icons ---");

  // 32x32
  const png32 = await svgToPng(svgContent, 32);
  fs.writeFileSync(path.join(TAURI_ICONS_DIR, "32x32.png"), png32);
  console.log("  32x32.png");

  // 128x128
  const png128 = await svgToPng(svgContent, 128);
  fs.writeFileSync(path.join(TAURI_ICONS_DIR, "128x128.png"), png128);
  console.log("  128x128.png");

  // 128x128@2x (256px)
  const png256 = await svgToPng(svgContent, 256);
  fs.writeFileSync(path.join(TAURI_ICONS_DIR, "128x128@2x.png"), png256);
  console.log("  128x128@2x.png");

  // icon.png (512px for master icon)
  const png512 = await svgToPng(svgContent, 512);
  fs.writeFileSync(path.join(TAURI_ICONS_DIR, "icon.png"), png512);
  console.log("  icon.png (512x512)");

  // Windows Store logos
  const windowsSizes = [30, 44, 71, 89, 107, 142, 150, 284, 310, 50];
  console.log("\n--- Windows Store Logos ---");
  for (const size of windowsSizes) {
    const png = await svgToPng(svgContent, size);
    const filename =
      size === 50 ? "StoreLogo.png" : `Square${size}x${size}Logo.png`;
    fs.writeFileSync(path.join(TAURI_ICONS_DIR, filename), png);
    console.log(`  ${filename}`);
  }

  // Generate Web icons
  console.log("\n--- Web Favicon & Icons ---");

  // favicon.ico placeholder (will need actual ico generation)
  // For now, copy 32x32 as reference
  fs.writeFileSync(path.join(WEB_APP_DIR, "icon.png"), png32);
  console.log("  src/app/icon.png (32x32)");

  // apple-icon.png (180x180)
  const png180 = await svgToPng(svgContent, 180);
  fs.writeFileSync(path.join(WEB_APP_DIR, "apple-icon.png"), png180);
  console.log("  src/app/apple-icon.png (180x180)");

  // Public icons for PWA manifest
  const png192 = await svgToPng(svgContent, 192);
  fs.writeFileSync(path.join(WEB_PUBLIC_DIR, "icon-192.png"), png192);
  console.log("  public/icon-192.png");

  fs.writeFileSync(path.join(WEB_PUBLIC_DIR, "icon-512.png"), png512);
  console.log("  public/icon-512.png");

  // Copy SVG for scalable icon
  fs.copyFileSync(SVG_PATH, path.join(WEB_PUBLIC_DIR, "icon.svg"));
  console.log("  public/icon.svg");

  console.log("\n--- Icon Generation Complete! ---");
  console.log("\nNote: For .ico and .icns files, run:");
  console.log("  cd schedule-ai-tauri && pnpm tauri icon ../assets/app-icon.png");
  console.log("\nFirst generate a 1024x1024 PNG:");
  console.log("  node -e \"...(generate 1024px version)\"");
}

generateIcons().catch(console.error);
