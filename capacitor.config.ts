import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.cafe.mobile',
  appName: 'Cafe',
  // Vite mobile build output directory
  webDir: 'dist-mobile',
  // Server configuration: load from local assets (not a remote URL)
  server: {
    // Use http scheme to avoid mixed-content CORS preflight failures on Android WebView.
    // With 'https', POST requests (which trigger OPTIONS preflight) to http:// LAN servers
    // are intermittently blocked by Android WebView's mixed-content policy.
    androidScheme: 'http',
    // Allow navigation to any origin (needed for WebSocket connections)
    allowNavigation: ['*']
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 500,
      backgroundColor: '#0a0a0a',
      showSpinner: false
    },
    Keyboard: {
      // Use 'ionic' resize mode for proper keyboard handling
      // This resizes the WebView and updates safe-area-inset-bottom
      resize: 'ionic' as any,
      resizeOnFullScreen: true,
      // Keep keyboard open when tapping outside
      hideFormAccessoryBar: false
    },
    LocalNotifications: {
      // Use default notification channel
      smallIcon: 'ic_notification',
      iconColor: '#3b82f6'
    }
  },
  android: {
    // Allow cleartext traffic for LAN connections (http://)
    allowMixedContent: true,
    // Background mode: keep WebSocket alive
    backgroundColor: '#0a0a0a'
  }
}

export default config
