#!/usr/bin/env node
/**
 * iOS build environment setup. Run from repo root on macOS: node scripts/setup-ios.js
 * Adds Capacitor iOS platform (creates mobile/ios/). Requires Xcode and CocoaPods.
 * Non-macOS: exits with instructions.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const isMac = process.platform === 'darwin';

function run(cmd, opts = {}) {
  try {
    execSync(cmd, { stdio: 'inherit', ...opts });
    return true;
  } catch {
    return false;
  }
}

function hasCommand(name) {
  try {
    execSync(`which ${name}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

console.log('=== iOS build environment setup ===\n');

if (!isMac) {
  console.log('iOS build requires macOS (Xcode and iOS toolchain are only available on Mac).');
  console.log('On Windows/Linux: The server builds Android APK only. For iOS, build on a Mac or use a CI runner (e.g. GitHub Actions with macos-latest).\n');
  console.log('See docs/IOS_BUILD.md for details.');
  process.exit(0);
}

// Check Xcode
let xcodePath = null;
try {
  xcodePath = execSync('xcode-select -p', { encoding: 'utf8' }).trim();
} catch {}
if (!xcodePath || !fs.existsSync(xcodePath)) {
  console.log('Xcode command-line tools not found. Install from Mac App Store or developer.apple.com');
  console.log('Then run: xcode-select --install\n');
  process.exit(1);
}

try {
  const version = execSync('xcodebuild -version', { encoding: 'utf8' });
  console.log('Xcode found:', version.split('\n')[0]);
} catch {
  console.log('xcodebuild failed. Install Xcode from Mac App Store.\n');
  process.exit(1);
}

// Check CocoaPods
if (!hasCommand('pod')) {
  console.log('CocoaPods not found. Install with:');
  console.log('  sudo gem install cocoapods');
  console.log('  or: brew install cocoapods\n');
  process.exit(1);
}
console.log('CocoaPods found');

const mobileDir = path.join(ROOT, 'mobile');
const iosDir = path.join(mobileDir, 'ios');

if (!fs.existsSync(path.join(ROOT, 'frontend', 'package.json')) || !fs.existsSync(path.join(mobileDir, 'package.json'))) {
  console.log('Frontend or mobile package.json not found.');
  process.exit(1);
}

// Ensure mobile deps installed
const capCliDir = path.join(mobileDir, 'node_modules', '@capacitor', 'cli');
if (!fs.existsSync(capCliDir)) {
  console.log('Installing mobile dependencies...');
  execSync('npm install', { cwd: mobileDir, stdio: 'inherit' });
}

if (!fs.existsSync(iosDir)) {
  console.log('Adding iOS platform...');
  execSync('npx cap add ios', { cwd: mobileDir, stdio: 'inherit' });
  console.log('iOS platform added to mobile/ios/');
} else {
  console.log('iOS platform already exists at mobile/ios/');
}

console.log('\n=== Setup complete ===');
console.log('Run: npm run build:ios   (build simulator .app)');
console.log('Or:  cd mobile && npx cap open ios   (open in Xcode for device/App Store)\n');
