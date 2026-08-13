import type { CapacitorConfig } from '@capacitor/cli';

// The native shell loads the deployed Gold Card web app directly, so every
// update to the server updates the app instantly with no store re-release
// (Apple/Google both allow this for HTML/JS content served over HTTPS).
//
// IMPORTANT: replace `url` with your real production HTTPS domain before
// building. It must serve the gold-card app (apps/gold-card) with a valid
// TLS certificate. Patients open the app onto their own card — the app
// remembers the card URL after first open (see www/index.html).
const config: CapacitorConfig = {
  appId: 'uk.co.gmdental.goldcard',
  appName: 'GM Dental Gold Card',
  webDir: 'www',
  backgroundColor: '#0f172a',
  server: {
    url: 'https://goldcard.gmdental.example', // <-- SET THIS to your deployed BASE_URL
    cleartext: false,
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
