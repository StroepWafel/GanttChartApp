#!/usr/bin/env node
/**
 * Attempt to install Android Studio (or JDK 17 + Android SDK) for mobile builds.
 * Run from repo root: node scripts/setup-android.js
 * Windows: requires admin/elevated shell. Linux: may require sudo.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const isLinux = process.platform === 'linux';
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
const linuxPaths = ['/opt/android-studio/jbr', '/usr/lib/jvm/java-17-openjdk-amd64', '/usr/lib/jvm/java-17-openjdk', '/usr/lib/jvm/java-11-openjdk-amd64', '/usr/lib/jvm/default-java'];
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
const hasJava17 =
  hasJavaInPath() ||
  (isWindows && fs.existsSync(path.join(androidStudioJbr, 'bin', 'java.exe'))) ||
  (isLinux && linuxPaths.some((p) => fs.existsSync(p) && checkJavaVersion(p))) ||
  (isMac && fs.existsSync('/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/java')) ||
  (process.env.JAVA_HOME && checkJavaVersion(process.env.JAVA_HOME));

if (hasJava17) {
  console.log('Java 17+ appears to be available.\n');
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

// 2. Check for Android Studio / SDK
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

if (hasAndroidStudio) {
  console.log('Android Studio / SDK appears to be installed.');
  console.log('You can run: npm run build:mobile\n');
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
