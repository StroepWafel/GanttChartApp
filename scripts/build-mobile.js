#!/usr/bin/env node
/**
 * Build mobile app (Capacitor) with hardcoded server URL. Run from repo root via npm run build:mobile.
 * Requires: .env with PUBLIC_URL and MOBILE_APP_ENABLED=true
 * Produces: mobile/dist (web bundle), runs cap sync, builds APK at mobile/releases/app.apk
 * Requires: Java/Android SDK for APK build (Android Studio or JDK + Android SDK)
 *
 * iOS: npm run build:ios (macOS only). Produces mobile/releases/App.app (simulator).
 *      Device/App Store: use Xcode (npm run setup:ios && cd mobile && npx cap open ios)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const buildIos = process.argv.includes('--ios') || process.env.BUILD_IOS === 'true' || process.env.BUILD_IOS === '1';

/** Find Android SDK for Gradle */
function findAndroidSdk() {
  if (process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME)) return process.env.ANDROID_HOME;
  if (process.env.ANDROID_SDK_ROOT && fs.existsSync(process.env.ANDROID_SDK_ROOT)) return process.env.ANDROID_SDK_ROOT;
  const candidates = [];
  if (isWindows) {
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    candidates.push(path.join(localAppData, 'Android', 'Sdk'));
    const androidStudio = path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Android', 'Android Studio');
    if (fs.existsSync(androidStudio)) {
      candidates.push(path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Android', 'Sdk'));
    }
  } else {
    const home = process.env.HOME || '';
    candidates.push(path.join(home, 'Android', 'Sdk'), '/opt/android-sdk', '/usr/local/android-sdk', path.join(home, 'Library', 'Android', 'sdk'));
    // Snap Android Studio may store SDK in android-studio subdir or user home
    candidates.push('/snap/android-studio/current/android-studio/sdk', path.join(home, 'snap', 'android-studio', 'current', 'Android', 'Sdk'));
  }
  for (const d of candidates) {
    if (d && fs.existsSync(d)) {
      const buildTools = path.join(d, 'build-tools');
      const platforms = path.join(d, 'platforms');
      if (fs.existsSync(buildTools) || fs.existsSync(platforms)) return d;
    }
  }
  return null;
}

/** Find Java 11+ for Gradle (Android Gradle Plugin 8.x requires Java 11+) */
function findJavaHome() {
  const tryDirs = [];
  if (process.env.JAVA_HOME) tryDirs.push(process.env.JAVA_HOME);
  if (isWindows) {
    const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    for (const pf of [progFiles, progFilesX86]) {
      const androidStudio = path.join(pf, 'Android', 'Android Studio');
      if (fs.existsSync(androidStudio)) {
        tryDirs.push(path.join(androidStudio, 'jbr'));
        tryDirs.push(path.join(androidStudio, 'jre'));
        const entries = fs.readdirSync(androidStudio).filter((e) => /^jbr|jre$/i.test(e));
        for (const e of entries) tryDirs.push(path.join(androidStudio, e));
      }
    }
    for (const base of [
      path.join(progFiles, 'Eclipse Adoptium'),
      path.join(progFiles, 'Microsoft'),
      path.join(progFiles, 'Java'),
      path.join(progFiles, 'OpenJDK'),
    ]) {
      if (fs.existsSync(base)) {
        const entries = fs.readdirSync(base);
        const jdk = entries.find((e) => /^jdk-(17|21|11)/i.test(e));
        if (jdk) tryDirs.push(path.join(base, jdk));
      }
    }
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Local');
    const localPrograms = path.join(localAppData, 'Programs');
    if (fs.existsSync(localPrograms)) {
      try {
        const subdirs = fs.readdirSync(localPrograms);
        for (const sub of subdirs) {
          if (/Eclipse Adoptium|Microsoft|OpenJDK/i.test(sub)) {
            const base = path.join(localPrograms, sub);
            const entries = fs.readdirSync(base);
            const jdk = entries.find((e) => /^jdk-(17|21|11)/i.test(e));
            if (jdk) tryDirs.push(path.join(base, jdk));
          }
        }
      } catch {}
    }
  } else {
    const jvmBase = '/usr/lib/jvm';
    if (fs.existsSync(jvmBase)) {
      const entries = fs.readdirSync(jvmBase);
      for (const e of entries) {
        if (/java-(17|21|11)/.test(e)) tryDirs.push(path.join(jvmBase, e));
      }
    }
    tryDirs.push('/opt/java/jdk-17', '/usr/lib/jvm/java-17-openjdk', '/usr/lib/jvm/java-11-openjdk');
    // Snap-installed Android Studio (JBR bundled)
    const snapPaths = ['/snap/android-studio/current/android-studio/jbr', '/snap/android-studio/current/jbr', '/snap/android-studio/current/android-studio/jre'];
    for (const p of snapPaths) tryDirs.push(p);
  }
  for (const d of tryDirs) {
    if (!d || !fs.existsSync(d)) continue;
    const javaBin = path.join(d, 'bin', 'java' + (isWindows ? '.exe' : ''));
    if (!fs.existsSync(javaBin)) continue;
    try {
      const out = execSync(`"${javaBin}" -version 2>&1`, { encoding: 'utf8', maxBuffer: 1024 });
      const match = out.match(/version "(\d+)/);
      if (match && parseInt(match[1], 10) >= 11) return d;
    } catch {}
  }
  // Fallback: use system java if it's 11+
  try {
    const out = execSync('java -version 2>&1', { encoding: 'utf8', maxBuffer: 1024 });
    const match = out.match(/version "(\d+)/);
    if (match && parseInt(match[1], 10) >= 11 && process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME)) {
      return process.env.JAVA_HOME;
    }
  } catch {}
  return null;
}

const sharp = require('sharp');
const ico = require('sharp-ico');

const ROOT = path.resolve(__dirname, '..');

require('dotenv').config({ path: path.join(ROOT, '.env') });
const env = { ...process.env };
const MOBILE_APP_ENABLED = env.MOBILE_APP_ENABLED === 'true';
let PUBLIC_URL = (env.PUBLIC_URL || '').trim().replace(/\/$/, '');

if (!MOBILE_APP_ENABLED) {
  console.log('build-mobile: MOBILE_APP_ENABLED is not true, skipping');
  process.exit(0);
}

if (!PUBLIC_URL || PUBLIC_URL === 'null') {
  console.log('build-mobile: PUBLIC_URL is not set, skipping');
  process.exit(0);
}

let APP_VERSION = '0.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  APP_VERSION = pkg.version || '0.0.0';
} catch {}
env.VITE_APP_VERSION = APP_VERSION;

const frontendDir = path.join(ROOT, 'frontend');
const mobileDir = path.join(ROOT, 'mobile');
const mobileDistDir = path.join(mobileDir, 'dist');

if (!fs.existsSync(path.join(frontendDir, 'src')) || !fs.existsSync(path.join(frontendDir, 'package.json'))) {
  console.log('build-mobile: frontend source not found, skipping');
  process.exit(0);
}

console.log('=== Building mobile app (Capacitor) ===');
console.log('Building frontend with VITE_API_URL=' + PUBLIC_URL + ' VITE_BASE_PATH=/');

// Build to frontend/dist-mobile so we don't overwrite frontend/dist (used by PC/server)
const frontendMobileDist = path.join(frontendDir, 'dist-mobile');
if (fs.existsSync(frontendMobileDist)) fs.rmSync(frontendMobileDist, { recursive: true });

try {
  execSync('npm run build', {
    cwd: frontendDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_API_URL: PUBLIC_URL,
      VITE_BASE_PATH: '/',
      VITE_APP_VERSION: APP_VERSION,
      VITE_OUT_DIR: 'dist-mobile',
    },
  });
} catch (e) {
  console.error('build-mobile: Frontend build failed');
  process.exit(1);
}

if (fs.existsSync(mobileDistDir)) fs.rmSync(mobileDistDir, { recursive: true });
fs.cpSync(frontendMobileDist, mobileDistDir, { recursive: true });
console.log('Copied build to mobile/dist');

(async () => {
  // Generate app icons from favicon (for Capacitor app icon / resources)
  const iconsDir = path.join(mobileDistDir, 'icons');
  if (fs.existsSync(iconsDir)) fs.rmSync(iconsDir, { recursive: true });
  fs.mkdirSync(iconsDir, { recursive: true });
  const faviconPath = path.join(mobileDistDir, 'favicon.ico');
  if (fs.existsSync(faviconPath)) {
    try {
      const sharps = ico.sharpsFromIco(faviconPath);
      if (sharps.length > 0) {
        const best = sharps[sharps.length - 1];
        // Maskable safe zone: center 58% of icon – Android/iOS apply circle/squircle masks that crop edges.
        // Use 58% (not 66%) to avoid text/graphics being cut off on some devices.
        const safeZoneScale = 0.58;

        const makeMaskableIcon = async (size) => {
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
          return base.composite([{ input: await resized.toBuffer(), left: offset, top: offset }]).png();
        };

        const icon192 = await makeMaskableIcon(192);
        const icon512 = await makeMaskableIcon(512);
        const icon1024 = await makeMaskableIcon(1024);
        await Promise.all([
          icon192.toFile(path.join(iconsDir, 'icon-192.png')),
          icon512.toFile(path.join(iconsDir, 'icon-512.png')),
          icon1024.toFile(path.join(iconsDir, 'icon-1024.png')),
        ]);
        console.log('Generated PWA/App icons from favicon (192, 512, 1024; safe zone)');

        const androidResDir = path.join(mobileDir, 'android', 'app', 'src', 'main', 'res');
        if (fs.existsSync(androidResDir)) {
          const densities = [
            { dir: 'mipmap-mdpi', launcher: 48, foreground: 108 },
            { dir: 'mipmap-hdpi', launcher: 72, foreground: 162 },
            { dir: 'mipmap-xhdpi', launcher: 96, foreground: 216 },
            { dir: 'mipmap-xxhdpi', launcher: 144, foreground: 324 },
            { dir: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
          ];
          for (const d of densities) {
            const dirPath = path.join(androidResDir, d.dir);
            if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
            const innerL = Math.round(d.launcher * safeZoneScale);
            const offsetL = Math.round((d.launcher - innerL) / 2);
            const innerF = Math.round(d.foreground * safeZoneScale);
            const offsetF = Math.round((d.foreground - innerF) / 2);
            const resizedL = best.resize(innerL, innerL);
            const resizedF = best.resize(innerF, innerF);
            const launcherBuf = await resizedL.toBuffer();
            const foregroundBuf = await resizedF.toBuffer();
            await Promise.all([
              sharp({
                create: {
                  width: d.launcher,
                  height: d.launcher,
                  channels: 4,
                  background: { r: 51, g: 51, b: 51, alpha: 1 },
                },
              })
                .composite([{ input: launcherBuf, left: offsetL, top: offsetL }])
                .png()
                .toFile(path.join(dirPath, 'ic_launcher.png')),
              sharp({
                create: {
                  width: d.launcher,
                  height: d.launcher,
                  channels: 4,
                  background: { r: 51, g: 51, b: 51, alpha: 1 },
                },
              })
                .composite([{ input: launcherBuf, left: offsetL, top: offsetL }])
                .png()
                .toFile(path.join(dirPath, 'ic_launcher_round.png')),
              sharp({
                create: {
                  width: d.foreground,
                  height: d.foreground,
                  channels: 4,
                  background: { r: 51, g: 51, b: 51, alpha: 1 },
                },
              })
                .composite([{ input: foregroundBuf, left: offsetF, top: offsetF }])
                .png()
                .toFile(path.join(dirPath, 'ic_launcher_foreground.png')),
            ]);
          }
          console.log('Generated Android launcher icons from favicon (with safe zone)');
        }
      }
    } catch (err) {
      console.warn('build-mobile: Could not generate icons from favicon:', err.message);
    }
  }

  const manifest = {
    name: 'Gantt Chart',
    short_name: 'Gantt',
    description: 'Gantt chart app',
    start_url: '/',
    display: 'standalone',
    background_color: '#333333',
    theme_color: '#333333',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  fs.writeFileSync(path.join(mobileDistDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Created manifest.json');

  const indexPath = path.join(mobileDistDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    let html = fs.readFileSync(indexPath, 'utf8');
    if (!html.includes('rel="manifest"')) {
      html = html.replace('<head>', '<head>\n    <link rel="manifest" href="/manifest.json">');
      fs.writeFileSync(indexPath, html);
    }
  }

  const androidDir = path.join(mobileDir, 'android');
  const iosDir = path.join(mobileDir, 'ios');
  const releasesDir = path.join(mobileDir, 'releases');

  if (buildIos && !isMac) {
    console.log('iOS build requires macOS (Xcode). Use a Mac or CI with macos-latest.');
    console.log('Android APK can be built on any platform. See docs/IOS_BUILD.md');
    process.exit(0);
  }

  if (!buildIos && !fs.existsSync(androidDir)) {
    console.error('build-mobile: android/ missing. Run: npm run setup:android');
    process.exit(1);
  }

  if (buildIos && !fs.existsSync(iosDir)) {
    console.error('build-mobile: ios/ missing. Run: npm run setup:ios (on macOS)');
    process.exit(1);
  }

  try {
    execSync('npx cap sync', { cwd: mobileDir, stdio: 'inherit' });
    console.log('Capacitor sync complete');
  } catch (e) {
    console.warn('build-mobile: cap sync failed:', e.message);
  }

  if (buildIos) {
    // iOS build (macOS only)
    const iosAppDir = path.join(iosDir, 'App');
    const derivedPath = path.join(iosAppDir, 'build');
    const appOutput = path.join(derivedPath, 'Build', 'Products', 'Debug-iphonesimulator', 'App.app');

    console.log('Running pod install...');
    try {
      execSync('pod install', { cwd: iosAppDir, stdio: 'inherit' });
    } catch (e) {
      console.error('build-mobile: pod install failed. Ensure CocoaPods is installed (brew install cocoapods or sudo gem install cocoapods)');
      process.exit(1);
    }

    console.log('Building for iOS Simulator...');
    try {
      execSync(
        `xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug -sdk iphonesimulator -derivedDataPath build -quiet`,
        { cwd: iosAppDir, stdio: 'inherit' }
      );
    } catch (e) {
      console.error('build-mobile: xcodebuild failed. Ensure Xcode is installed (xcode-select -p, xcodebuild -version)');
      process.exit(1);
    }

    if (fs.existsSync(appOutput)) {
      if (!fs.existsSync(releasesDir)) fs.mkdirSync(releasesDir, { recursive: true });
      const appDest = path.join(releasesDir, 'App.app');
      if (fs.existsSync(appDest)) fs.rmSync(appDest, { recursive: true });
      fs.cpSync(appOutput, appDest, { recursive: true });
      console.log('iOS app built: mobile/releases/App.app (simulator)');
      console.log('To run: open mobile/releases/App.app');
      console.log('For device/App Store: cd mobile && npx cap open ios');
    } else {
      console.error('build-mobile: App.app not found after xcodebuild');
      process.exit(1);
    }
  } else {
    // Android build
    const apkOutput = path.join(androidDir, 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
    const apkDest = path.join(releasesDir, 'app.apk');

  if (fs.existsSync(androidDir)) {
    const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew';
    const gradleEnv = { ...process.env };
    const javaHome = findJavaHome();
    if (javaHome) {
      gradleEnv.JAVA_HOME = javaHome;
      console.log('Using Java at', javaHome);
    } else {
      console.warn('build-mobile: Java 11+ not found. Run: npm run setup:android');
      console.warn(
        isWindows
          ? 'Or add to .env: JAVA_HOME=C:\\Program Files\\Android\\Android Studio\\jbr'
          : 'Or add to .env: JAVA_HOME=/snap/android-studio/current/android-studio/jbr (snap) or JAVA_HOME=/usr/lib/jvm/java-17-openjdk (apt)',
      );
    }
    const androidSdk = findAndroidSdk();
    if (androidSdk) {
      gradleEnv.ANDROID_HOME = androidSdk;
      gradleEnv.ANDROID_SDK_ROOT = androidSdk;
      const localProps = path.join(androidDir, 'local.properties');
      const sdkDirLine = 'sdk.dir=' + androidSdk.replace(/\\/g, '/');
      fs.writeFileSync(localProps, sdkDirLine + '\n', 'utf8');
      console.log('Using Android SDK at', androidSdk);
    } else {
      console.error('build-mobile: Android SDK not found. Set ANDROID_HOME or run Android Studio once to install the SDK.');
      console.error(
        isWindows
          ? 'Default SDK path: %LOCALAPPDATA%\\Android\\Sdk'
          : 'Default SDK path: ~/Android/Sdk (run Android Studio once to download, or use command-line tools)',
      );
      process.exit(1);
    }
    try {
      execSync(`${gradleCmd} assembleDebug --no-daemon`, { cwd: androidDir, stdio: 'inherit', env: gradleEnv });
    } catch (e) {
      console.error('build-mobile: Gradle build failed. Install Android Studio (or JDK 17 + Android SDK) to build APKs locally.');
      console.error('Alternatively, run the GitHub workflow "Build Mobile App" to produce an APK artifact.');
      process.exit(1);
    }
    if (fs.existsSync(apkOutput)) {
      if (!fs.existsSync(releasesDir)) fs.mkdirSync(releasesDir, { recursive: true });
      fs.copyFileSync(apkOutput, apkDest);
      console.log('APK built and copied to mobile/releases/app.apk');
    } else {
      console.error('build-mobile: APK not found after Gradle build');
      process.exit(1);
    }
  } else {
    console.warn('build-mobile: android/ folder missing; run "cd mobile && npx cap add android"');
  }
  }

  console.log('=== Mobile app build complete ===');
})().catch((err) => {
  console.error('build-mobile:', err);
  process.exit(1);
});
