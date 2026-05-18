import { copyFileSync, mkdirSync, existsSync, rmSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');

// Helper function to copy directory recursively
function copyRecursive(src, dest) {
  if (!existsSync(src)) {
    console.log(`Source not found: ${src}, skipping`);
    return;
  }

  const stat = statSync(src);

  if (stat.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    const entries = readdirSync(src);
    for (const entry of entries) {
      copyRecursive(join(src, entry), join(dest, entry));
    }
  } else {
    copyFileSync(src, dest);
  }
}

// Copy web.svg to assets
function copyWebSvg() {
  const srcSvg = join(root, 'src', 'assets', 'web.svg');
  const destSvg = join(dist, 'assets', 'web.svg');
  if (existsSync(srcSvg)) {
    copyFileSync(srcSvg, destSvg);
    console.log('Copied web.svg');
  }
}

// Copy PNG icons (or generate from SVG as fallback)
async function copyIcons() {
  mkdirSync(join(dist, 'assets'), { recursive: true });

  const sizes = [16, 48, 128];

  for (const size of sizes) {
    const srcIcon = join(root, 'src', 'assets', `icon-${size}.png`);
    const destIcon = join(dist, 'assets', `icon-${size}.png`);

    if (existsSync(srcIcon)) {
      copyFileSync(srcIcon, destIcon);
      console.log(`Copied icon-${size}.png`);
    } else {
      // Fallback: generate from SVG
      const svgPath = join(root, 'src', 'assets', 'web.svg');
      if (existsSync(svgPath)) {
        await sharp(svgPath)
          .resize(size, size)
          .png()
          .toFile(destIcon);
        console.log(`Created icon-${size}.png from web.svg`);
      }
    }
  }
}


// Move popup.html to correct location and fix paths
const srcHtml = join(dist, 'src', 'popup', 'popup.html');
const destHtml = join(dist, 'popup', 'popup.html');

if (existsSync(srcHtml)) {
  mkdirSync(join(dist, 'popup'), { recursive: true });

  // Read HTML and fix paths
  let htmlContent = readFileSync(srcHtml, 'utf-8');

  // Fix relative paths for the new structure
  // The HTML references files relative to dist/src/popup/, we need them relative to dist/popup/
  htmlContent = htmlContent.replace(/\.\.\/\.\.\/popup\//g, './');
  htmlContent = htmlContent.replace(/\.\.\/\.\.\/shared\//g, './');
  htmlContent = htmlContent.replace(/\.\.\/\.\.\/assets\//g, '../assets/');
  // Also handle single level paths
  htmlContent = htmlContent.replace(/\.\/popup\//g, './');

  writeFileSync(destHtml, htmlContent);

  // Remove src directory
  rmSync(join(dist, 'src'), { recursive: true, force: true });
}

// Copy compare.html
const srcCompareHtml = join(root, 'src', 'compare', 'compare.html');
const destCompareDir = join(dist, 'compare');
if (existsSync(srcCompareHtml)) {
  mkdirSync(destCompareDir, { recursive: true });
  copyFileSync(srcCompareHtml, join(destCompareDir, 'compare.html'));
  console.log('Copied compare.html');
}

// Copy report.html
const srcReportHtml = join(root, 'src', 'report', 'report.html');
const destReportDir = join(dist, 'report');
if (existsSync(srcReportHtml)) {
  mkdirSync(destReportDir, { recursive: true });
  copyFileSync(srcReportHtml, join(destReportDir, 'report.html'));
  console.log('Copied report.html');
}

// Copy manifest.json
copyFileSync(join(root, 'manifest.json'), join(dist, 'manifest.json'));

// Run async tasks
async function main() {
  // Copy PNG icons
  await copyIcons();

  // Copy web.svg
  copyWebSvg();

  console.log('Post-build completed successfully!');
}

main().catch(console.error);
