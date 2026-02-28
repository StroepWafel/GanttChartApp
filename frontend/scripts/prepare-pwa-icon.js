#!/usr/bin/env node
/**
 * Extracts favicon.ico to icon-source.png for PWA assets generator.
 * Uses 50% safe zone (maskable) - sharp-ico is needed for ICO support.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ico from 'sharp-ico';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const faviconPath = path.join(publicDir, 'favicon.ico');
const outPath = path.join(publicDir, 'icon-source.png');

if (!fs.existsSync(faviconPath)) {
  console.warn('prepare-pwa-icon: No favicon.ico in public/, skipping.');
  process.exit(0);
}

try {
  const sharps = ico.sharpsFromIco(faviconPath);
  if (sharps.length === 0) throw new Error('No valid frames in ICO');
  const best = sharps[sharps.length - 1];
  const safeZoneScale = 0.5;
  const size = 512;
  const inner = Math.round(size * safeZoneScale);
  const offset = Math.round((size - inner) / 2);
  const resized = best.resize(inner, inner);
  const base = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 51, g: 51, b: 51, alpha: 1 },
    },
  });
  await base
    .composite([{ input: await resized.toBuffer(), left: offset, top: offset }])
    .png()
    .toFile(outPath);
  console.log('prepare-pwa-icon: Generated public/icon-source.png');
} catch (err) {
  console.warn('prepare-pwa-icon:', err.message);
  process.exit(0);
}
