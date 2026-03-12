// Generate placeholder app icons as SVG → convert to PNG later
// For now, create SVG files that can be used with @capacitor/assets
const fs = require("fs");
const path = require("path");

const assetsDir = path.join(__dirname, "..", "assets");
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

// App icon SVG (1024x1024)
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#0a0a0a"/>
  <circle cx="512" cy="512" r="350" fill="none" stroke="rgba(200,255,0,0.06)" stroke-width="80"/>
  <text x="512" y="530" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="220" fill="#c8ff00" text-anchor="middle" dominant-baseline="middle" letter-spacing="8">LOOPS</text>
</svg>`;

// Splash screen SVG (2732x2732)
const splashSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732" viewBox="0 0 2732 2732">
  <rect width="2732" height="2732" fill="#0a0a0a"/>
  <circle cx="1366" cy="1366" r="600" fill="none" stroke="rgba(200,255,0,0.04)" stroke-width="120"/>
  <text x="1366" y="1366" font-family="Arial Black, Impact, sans-serif" font-weight="900" font-size="320" fill="#c8ff00" text-anchor="middle" dominant-baseline="middle" letter-spacing="12">LOOPS</text>
  <text x="1366" y="1540" font-family="Arial, sans-serif" font-weight="400" font-size="52" fill="#666666" text-anchor="middle" dominant-baseline="middle">Cycling Routes Worldwide</text>
</svg>`;

// Background (solid dark)
const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#0a0a0a"/>
</svg>`;

fs.writeFileSync(path.join(assetsDir, "icon-only.svg"), iconSvg);
fs.writeFileSync(path.join(assetsDir, "icon-foreground.svg"), iconSvg);
fs.writeFileSync(path.join(assetsDir, "icon-background.svg"), bgSvg);
fs.writeFileSync(path.join(assetsDir, "splash.svg"), splashSvg);
fs.writeFileSync(path.join(assetsDir, "splash-dark.svg"), splashSvg);

console.log("Generated SVG assets in assets/ directory:");
console.log("  - icon-only.svg (app icon)");
console.log("  - icon-foreground.svg (Android adaptive icon foreground)");
console.log("  - icon-background.svg (Android adaptive icon background)");
console.log("  - splash.svg (splash screen)");
console.log("  - splash-dark.svg (dark splash screen)");
console.log("");
console.log("To convert to PNG for @capacitor/assets:");
console.log("  1. Open each SVG in a browser");
console.log("  2. Screenshot/export as PNG at the correct size");
console.log("  3. Or use: npx @aspect-build/svg2png icon-only.svg -o icon-only.png -w 1024 -h 1024");
console.log("");
console.log("Or simply replace these with your own designed icons and run:");
console.log("  npx capacitor-assets generate");
