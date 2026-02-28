# iOS Build Guide

iOS build support for the Gantt Chart Capacitor mobile app. Produces .app (simulator) or .ipa (device/App Store) for distribution.

## Prerequisites

**Platform:** macOS only. Xcode and the iOS toolchain are required.

- **Xcode** 15+ — Install from [Mac App Store](https://apps.apple.com/app/xcode/id497799835) or [developer.apple.com](https://developer.apple.com/xcode/)
- **Node.js** 22+ — Required by Capacitor
- **CocoaPods** — Install with `sudo gem install cocoapods` or `brew install cocoapods`
- **Apple Developer account** — Required for device testing and App Store distribution (free account allows simulator only)

## Quick Start

```bash
# Setup iOS platform (adds mobile/ios/)
npm run setup:ios

# Build for simulator (produces mobile/releases/App.app)
npm run build:ios
```

Or combine both:

```bash
npm run build:ios
```

## Simulator Build

1. Run `npm run build:ios`
2. Output: `mobile/releases/App.app`
3. To run: `open mobile/releases/App.app`
4. Or open in Xcode: `cd mobile && npx cap open ios`, then select a simulator and click Run

## Device Build

Requires an Apple Developer account and provisioning:

1. Run `cd mobile && npx cap open ios` to open Xcode
2. In Xcode: select your development team (Signing & Capabilities)
3. Connect your iPhone/iPad or select "Any iOS Device"
4. Product → Archive
5. Distribute App → Development (for testing) or App Store Connect (for TestFlight/App Store)

## App Store / TestFlight

1. Create an app record in [App Store Connect](https://appstoreconnect.apple.com)
2. In Xcode: Product → Archive
3. Distribute App → App Store Connect
4. Follow the upload wizard; the build will appear in TestFlight after processing

## Environment

Ensure `.env` has:

- `MOBILE_APP_ENABLED=true`
- `PUBLIC_URL` — Your server URL (e.g. `https://gantt.example.com`)

The build script uses `PUBLIC_URL` as the API base for the mobile app.

## Signing Notes

- **Simulator:** No signing required
- **Device:** Requires Apple Developer account, development certificate, provisioning profile
- **App Store:** Requires distribution certificate, App Store provisioning profile, App Store Connect app record

## Distribution Model

Unlike Android (APK built by server), **the iOS app is not built by the server** — iOS requires macOS/Xcode. The admin builds the .ipa locally (or via CI on a Mac) and uploads it to the server if distributing via your own backend. For App Store, use Xcode’s Archive and App Store Connect.

## CI/CD (Optional)

To build iOS in GitHub Actions, use a `macos-latest` runner:

```yaml
build-ios:
  runs-on: macos-latest
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: '22'
    - run: npm run install:all
    - run: npm run build:ios
    - uses: actions/upload-artifact@v4
      with:
        name: ios-app
        path: mobile/releases/App.app
```

For device/App Store builds in CI, configure signing with Fastlane Match or manual certificate/profile setup.
