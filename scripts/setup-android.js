#!/usr/bin/env node
/**
 * Full Android/mobile build environment setup. Run from repo root: node scripts/setup-android.js
 * Installs: Java 17+, Android SDK (or command-line tools), mobile npm deps, Capacitor Android platform.
 * Updates .env with JAVA_HOME and ANDROID_HOME when detected.
 * Windows: may require admin for Java/Android Studio. Linux: may require sudo for apt.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
const isMac = process.platform === 'darwin';

function appendToEnv(key, value) {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath) || fs.readFileSync(envPath, 'utf8').includes(key + '=')) return;
  let content = fs.readFileSync(envPath, 'utf8').trimEnd();
  if (!content.endsWith('\n')) content += '\n';
  content += `\n# Added by setup-android\n${key}=${value}\n`;
  fs.writeFileSync(envPath, content);
}

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
    if (isWindows) {
      execSync(`where ${name}`, { stdio: 'pipe' });
    } else {
      execSync(`which ${name}`, { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

function checkJavaVersion(dir) {
  const javaBin = path.join(dir, 'bin', isWindows ? 'java.exe' : 'java');
  if (!fs.existsSync(javaBin)) return false;
  try {
    const out = execSync(`"${javaBin}" -version 2>&1`, { encoding: 'utf8', maxBuffer: 1024 });
    const match = out.match(/version "(\d+)/);
    return match && parseInt(match[1], 10) >= 11;
  } catch {
    return false;
  }
}

console.log('=== Android build environment setup ===\n');

// 1. Check for Java 17
const androidStudioJbr = isWindows
  ? path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Android', 'Android Studio', 'jbr')
  : path.join(process.env.HOME || '', 'android-studio', 'jbr');
const linuxPaths = ['/opt/android-studio/jbr', '/usr/lib/jvm/java-17-openjdk-amd64', '/usr/lib/jvm/java-17-openjdk', '/usr/lib/jvm/java-11-openjdk-amd64', '/usr/lib/jvm/default-java', '/snap/android-studio/current/android-studio/jbr', '/snap/android-studio/current/jbr'];
function hasJavaInPath() {
  if (!hasCommand('java')) return false;
  try {
    const out = execSync('java -version 2>&1', { encoding: 'utf8', maxBuffer: 1024 });
    const match = out.match(/version "(\d+)/);
    return match && parseInt(match[1], 10) >= 11;
  } catch {
    return false;
  }
}
function findJavaHome() {
  if (process.env.JAVA_HOME && checkJavaVersion(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  if (isWindows && fs.existsSync(path.join(androidStudioJbr, 'bin', 'java.exe'))) return androidStudioJbr;
  if (isLinux) for (const p of linuxPaths) if (fs.existsSync(p) && checkJavaVersion(p)) return p;
  if (isMac && fs.existsSync('/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java')) return '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
  if (hasJavaInPath() && process.env.JAVA_HOME) return process.env.JAVA_HOME;
  return null;
}
const javaHome = findJavaHome();
const hasJava17 = !!javaHome || hasJavaInPath();

if (hasJava17) {
  console.log('Java 17+ found' + (javaHome ? ' at ' + javaHome : ' (in PATH)') + '\n');
  if (javaHome) appendToEnv('JAVA_HOME', javaHome);
} else {
  console.log('Java 17 not found. Attempting to install...\n');
  let installed = false;

  if (isWindows) {
    if (hasCommand('winget')) {
      console.log('Using winget to install OpenJDK 17...');
      if (run('winget install Microsoft.OpenJDK.17 --silent --accept-package-agreements --accept-source-agreements')) {
        installed = true;
        console.log('OpenJDK 17 installed. Restart this terminal and run npm run build:mobile again.');
      }
    }
    if (!installed && hasCommand('choco')) {
      console.log('Using Chocolatey to install OpenJDK 17...');
      if (run('choco install openjdk17 -y')) {
        installed = true;
        console.log('OpenJDK 17 installed. Restart this terminal and run npm run build:mobile again.');
      }
    }
  } else if (isLinux) {
    if (hasCommand('apt-get')) {
      console.log('Using apt to install OpenJDK 17 (may need sudo)...');
      if (run('sudo apt-get update && sudo apt-get install -y openjdk-17-jdk')) {
        installed = true;
      }
    }
    if (!installed && hasCommand('dnf')) {
      console.log('Using dnf to install OpenJDK 17 (may need sudo)...');
      if (run('sudo dnf install -y java-17-openjdk-devel')) {
        installed = true;
      }
    }
    if (!installed && hasCommand('yum')) {
      console.log('Using yum to install OpenJDK 17 (may need sudo)...');
      if (run('sudo yum install -y java-17-openjdk-devel')) {
        installed = true;
      }
    }
    if (!installed && hasCommand('pacman')) {
      console.log('Using pacman to install OpenJDK 17 (may need sudo)...');
      if (run('sudo pacman -S --noconfirm jdk17-openjdk')) {
        installed = true;
      }
    }
  } else if (isMac && hasCommand('brew')) {
    console.log('Using Homebrew to install OpenJDK 17...');
    if (run('brew install openjdk@17')) {
      installed = true;
    }
  }

  if (!installed) {
    console.log('Could not auto-install Java. Please install manually:');
    if (isLinux) console.log('  - Debian/Ubuntu: sudo apt install openjdk-17-jdk');
    if (isLinux) console.log('  - Fedora: sudo dnf install java-17-openjdk-devel');
    if (isLinux) console.log('  - Arch: sudo pacman -S jdk17-openjdk');
    if (isWindows) console.log('  - Windows: winget install Microsoft.OpenJDK.17');
    console.log('  - Or download from https://adoptium.net/\n');
  }
}

// 2. Check for Android SDK (must have build-tools or platforms)
function findAndroidSdk() {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const candidates = isWindows
    ? [path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Android', 'Sdk'), path.join(home, 'Android', 'Sdk')]
    : [path.join(home, 'Android', 'Sdk'), '/opt/android-sdk', '/usr/local/android-sdk'];
  for (const d of candidates) {
    if (d && fs.existsSync(d)) {
      const buildTools = path.join(d, 'build-tools');
      const platforms = path.join(d, 'platforms');
      if (fs.existsSync(buildTools) || fs.existsSync(platforms)) return d;
    }
  }
  return null;
}
let sdkPath = process.env.ANDROID_HOME && fs.existsSync(process.env.ANDROID_HOME) && (fs.existsSync(path.join(process.env.ANDROID_HOME, 'build-tools')) || fs.existsSync(path.join(process.env.ANDROID_HOME, 'platforms')))
  ? process.env.ANDROID_HOME
  : findAndroidSdk();

if (sdkPath) {
  console.log('Android SDK found at', sdkPath);
  appendToEnv('ANDROID_HOME', sdkPath);
}

// 3. On Linux headless: install SDK command-line tools (if not found)
if (isLinux && !sdkPath) {
  const sdkRoot = path.join(process.env.HOME || '/root', 'Android', 'Sdk');
  const cmdlineDir = path.join(sdkRoot, 'cmdline-tools', 'latest');
  const sdkManagerPath = path.join(cmdlineDir, 'bin', 'sdkmanager');
  const needsInstall = !fs.existsSync(sdkManagerPath);
  const needsPackages = needsInstall || !fs.existsSync(path.join(sdkRoot, 'platforms')) || !fs.existsSync(path.join(sdkRoot, 'build-tools'));
  if (needsInstall || needsPackages) {
    if (needsInstall) console.log('Android SDK not found. Installing command-line tools (headless)...\n');
    else console.log('Installing SDK packages (platform-tools, platforms, build-tools)...\n');
    const CMDLINE_URL = 'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip';
    const zipPath = path.join(os.tmpdir(), 'cmdline-tools.zip');
    try {
      if (needsInstall) {
        if (!hasCommand('wget') && !hasCommand('curl')) {
          console.log('Need wget or curl to download. Install with: sudo apt install wget');
          process.exit(1);
        }
        if (!hasCommand('unzip')) {
          console.log('Installing unzip...');
          if (!run('apt-get update && apt-get install -y unzip')) {
            console.log('Need unzip. Install with: apt-get install unzip (or sudo apt install unzip)');
            process.exit(1);
          }
        }
        fs.mkdirSync(sdkRoot, { recursive: true });
        const downloadCmd = hasCommand('wget') ? `wget -q -O "${zipPath}" "${CMDLINE_URL}"` : `curl -sL -o "${zipPath}" "${CMDLINE_URL}"`;
        execSync(downloadCmd, { stdio: 'inherit' });
        const extractDir = path.join(os.tmpdir(), 'cmdline-extract');
        if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true });
        fs.mkdirSync(extractDir, { recursive: true });
        execSync(`unzip -q -o "${zipPath}" -d "${extractDir}"`, { stdio: 'inherit' });
        const extracted = path.join(extractDir, 'cmdline-tools');
        fs.mkdirSync(path.dirname(cmdlineDir), { recursive: true });
        if (fs.existsSync(cmdlineDir)) fs.rmSync(cmdlineDir, { recursive: true });
        fs.renameSync(extracted, cmdlineDir);
        fs.unlinkSync(zipPath);
        fs.rmSync(extractDir, { recursive: true });
      }
      console.log('Installing platform-tools, platforms;android-34, build-tools;34.0.0...');
      const javaHome = process.env.JAVA_HOME || (fs.existsSync('/usr/lib/jvm/java-17-openjdk-amd64') ? '/usr/lib/jvm/java-17-openjdk-amd64' : null);
      const env = { ...process.env, ANDROID_HOME: sdkRoot, ANDROID_SDK_ROOT: sdkRoot };
      if (javaHome) env.JAVA_HOME = javaHome;
      execSync(`yes | "${path.join(cmdlineDir, 'bin', 'sdkmanager')}" --sdk_root="${sdkRoot}" "platform-tools" "platforms;android-34" "build-tools;34.0.0"`, { stdio: 'inherit', env });
      console.log('\nAndroid SDK installed at', sdkRoot);
      appendToEnv('ANDROID_HOME', sdkRoot);
      sdkPath = sdkRoot;
    } catch (e) {
      console.error('Failed to install SDK:', e.message);
      console.log('\nManual install: https://developer.android.com/studio#command-line-tools-only\n');
      process.exit(1);
    }
  }
}

// 4. Mobile setup (Capacitor deps + Android platform)
const mobileDir = path.join(ROOT, 'mobile');
if (fs.existsSync(path.join(ROOT, 'frontend', 'package.json')) && fs.existsSync(path.join(mobileDir, 'package.json'))) {
  const capCliDir = path.join(mobileDir, 'node_modules', '@capacitor', 'cli');
  if (!fs.existsSync(capCliDir)) {
    console.log('Installing mobile dependencies...');
    execSync('npm install', { cwd: mobileDir, stdio: 'inherit' });
  }
  const androidDir = path.join(mobileDir, 'android');
  if (!fs.existsSync(androidDir)) {
    console.log('Adding Android platform...');
    execSync('npx cap add android', { cwd: mobileDir, stdio: 'inherit' });
  }
}

// 5. Check for Android Studio (full IDE) - only if SDK still missing
const androidStudioPaths = isWindows
  ? [path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Android', 'Android Studio')]
  : isMac
    ? ['/Applications/Android Studio.app']
    : [
        '/opt/android-studio',
        path.join(process.env.HOME || '', 'android-studio'),
        '/snap/android-studio/current',
      ];
const hasAndroidStudio = androidStudioPaths.some((p) => fs.existsSync(p));

if (sdkPath) {
  console.log('\n=== Setup complete ===');
  console.log('You can run: npm run build:mobile\n');
  process.exit(0);
}

if (hasAndroidStudio) {
  console.log('Android Studio is installed but SDK was not found.');
  console.log('On Linux headless: run this script again; it will install the command-line SDK.');
  console.log('Otherwise: run Android Studio once to download the SDK, or set ANDROID_HOME to your SDK path.\n');
  process.exit(0);
}

console.log('Android Studio / SDK not found. Attempting to install...\n');

let asInstalled = false;

if (isWindows && hasCommand('winget')) {
  console.log('Using winget to install Android Studio (this may take several minutes, ~1GB download)...');
  console.log('You may need to run this script as Administrator.\n');
  try {
    execSync('winget install Google.AndroidStudio --silent --accept-package-agreements --accept-source-agreements', {
      stdio: 'inherit',
    });
    asInstalled = true;
  } catch {
    try {
      execSync('winget install "Android Studio" --silent --accept-package-agreements --accept-source-agreements', {
        stdio: 'inherit',
      });
      asInstalled = true;
    } catch {}
  }
} else if (isLinux && hasCommand('snap')) {
  console.log('Using snap to install Android Studio (this may take several minutes)...');
  if (run('sudo snap install android-studio --classic')) {
    asInstalled = true;
  }
}

if (asInstalled) {
  console.log('\nAndroid Studio installed. Restart your terminal, then run: npm run build:mobile');
} else {
  console.log('Could not auto-install Android Studio. Options:');
  console.log('  1. Install manually: https://developer.android.com/studio');
  if (isWindows) console.log('  2. Windows: winget install "Android Studio"');
  if (isLinux) console.log('  2. Linux: sudo snap install android-studio --classic');
  console.log('  3. Use GitHub Actions to build: run the "Build Mobile App" workflow\n');
}
