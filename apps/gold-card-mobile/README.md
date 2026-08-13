# Gold Card Mobile — iOS & Android app (Capacitor shell)

Native App Store / Play Store apps for the Gold Card. The shell loads the
deployed Gold Card web app (`apps/gold-card`) over HTTPS, so the app updates
instantly whenever the server updates — no store re-release for content
changes. The native layer adds what the web can't do: **push notifications**
(refer-reminders, reward alerts, draw-winner announcements), a home-screen
icon from the stores, and native share.

## Prerequisites

- The Gold Card server deployed at a public **HTTPS** domain (see
  `../gold-card/README.md` for deployment). Note the URL.
- **iOS**: a Mac with Xcode 15+, an Apple Developer Program account (£79/yr).
- **Android**: Android Studio, a Google Play Console account (one-off $25).
- Node 20+.

## 1. Configure

Edit `capacitor.config.ts`:
- Set `server.url` to your deployed HTTPS domain (e.g. `https://goldcard.gmdental.co.uk`).
- Keep `appId` (`uk.co.gmdental.goldcard`) or change it — it must match the
  bundle ID / application ID you register with Apple and Google, and cannot
  be changed after first release.

## 2. Generate native projects

```bash
cd apps/gold-card-mobile
npm install
npx cap add ios
npx cap add android
```

Drop a 1024×1024 `assets/icon.png` and 2732×2732 `assets/splash.png` in this
folder (use the gold-card branding), then:

```bash
npm run assets   # generates all icon/splash sizes for both platforms
npx cap sync
```

## 3. Push notifications

The card page already registers the device token with the server
(`POST /api/device-token`) when running inside the app. To make delivery work:

**Android (FCM):**
1. Create a Firebase project → add an Android app with your `appId` →
   download `google-services.json` into `android/app/`.
2. In Firebase project settings → Cloud Messaging, note the service account
   for the HTTP v1 API.

**iOS (APNs):**
1. In your Apple Developer account, enable the Push Notifications capability
   for the bundle ID; Xcode → Signing & Capabilities → add
   "Push Notifications" and "Background Modes → Remote notifications".
2. Create an APNs Auth Key (.p8) and upload it to the same Firebase project
   (easiest: deliver both platforms through FCM).

**Server side:** `src/services/notify.ts` in `apps/gold-card` is a stub that
logs instead of sending. Wire the `push` channel to the FCM HTTP v1 API using
the tokens in the `push_tokens` table (one small fetch call — the TODO marks
the spot). SMS (`sms` channel) similarly wires to Twilio or your SMS provider.

## 4. Build & submit

**iOS:**
```bash
npx cap open ios
```
In Xcode: set your team, bump the version, Product → Archive → Distribute →
App Store Connect. Create the app listing in App Store Connect (screenshots,
privacy policy URL, App Privacy questionnaire — the app collects: name,
phone/email of referred friends (with consent), push tokens).

**Android:**
```bash
npx cap open android
```
In Android Studio: Build → Generate Signed Bundle (AAB), upload to Play
Console. Complete the Data Safety form (same data set as above).

## Store-review notes (read before submitting)

- **Apple guideline 4.2 (minimum functionality):** thin web wrappers get
  rejected. This app clears it by shipping native push notifications and
  native share, but strengthen the case in the review notes: describe the
  loyalty-card use case, and provide a demo card code + a test login for the
  reviewer (create a demo referrer and include its card code in App Review
  notes).
- **Promotions/prize draw:** Apple requires the app to state that Apple is
  not a sponsor of the draw; the card footer's terms line covers the draw
  mechanics — link your full terms page in the listing.
- Both stores require a **privacy policy URL** — serve one from the gold-card
  server (e.g. `/privacy`) before submitting.

## How patients get the app

The invite SMS/email contains their card link. For app installs, send both
store links; on first open the app either loads the remote server directly
(if their card link was opened at least once, the code is remembered) or asks
for the 8-character card code from the invite (offline fallback page in
`www/index.html`).
