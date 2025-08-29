# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native mobile application built with Expo and Expo Router. It uses TypeScript and includes both iOS and Android platform support with a tab-based navigation structure. The app features authentication with multiple methods including PIN, passkeys (WebAuthn/FIDO2), and biometric authentication.

## Development Commands

- `npm start` - Start Expo development server
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS device/simulator
- `npm run web` - Run web version
- `npm run lint` - Run ESLint code linting
- `npm run reset-project` - Reset to blank app (moves current app to app-example)

## Android Development

For Android builds, use the Gradle wrapper in the android directory:
- `cd android && ./gradlew assembleDebug` - Build debug APK (Linux/macOS)
- `cd android && ./gradlew.bat assembleDebug` - Build debug APK (Windows)
- `cd android && ./gradlew clean` - Clean Android build
- `cd android && ./gradlew.bat clean` - Clean Android build (Windows)

## Architecture

**Routing**: Uses Expo Router with file-based routing. Main app structure is in `/app` directory.

**Navigation Structure**:
- Root layout: `/app/_layout.tsx` - Handles font loading, splash screen, theme provider, and authentication guard
- Tab layout: `/app/(tabs)/_layout.tsx` - Bottom tab navigation with Home, Cart (장바구니), and My (마이) tabs
- Authentication screens: `/app/biometric-login.tsx` with passkey authentication
- PIN screens: `/app/pin-setup.tsx` and `/app/pin-unlock.tsx`
- Main tabs: `/app/(tabs)/index.tsx` (Home), `/app/(tabs)/cart.tsx`, `/app/(tabs)/my.tsx`
- WebView screen: `/app/webview.tsx` - Generic WebView component for external content

**Authentication System**:
- Context-based authentication using `/hooks/useAuth.tsx`
- Multiple authentication methods: PIN, passkeys (WebAuthn/FIDO2), and biometric (deprecated)
- Secure storage for refresh tokens and user data via `/utils/secure.ts`
- Server API integration in `/utils/api.ts` with mock mode (`MOCK_WEB_AUTHN = true`)
- Authentication guard in root layout that redirects unauthenticated users

**Styling System**:
- Themed components in `/components` directory (ThemedText, ThemedView, etc.)
- Color system defined in `/constants/Colors.ts` with light/dark mode support
- Custom hooks for theme management in `/hooks` directory
- Haptic feedback integration with tab navigation

**Key Directories**:
- `/app` - Main application screens and routing with authentication flows
- `/components` - Reusable UI components with theming support
- `/constants` - App-wide constants including Colors and config
- `/hooks` - Custom React hooks (useAuth, useColorScheme, useThemeColor)
- `/utils` - Utility functions for API, security, passkeys, and Android settings
- `/types` - TypeScript type definitions
- `/android` - Android-specific build files and native biometric enrollment module

**Native Modules**:
- Custom Android biometric enrollment module (`BiometricEnrollModule.kt`)
- Handles device-specific biometric settings navigation across different Android OEMs

**Security Features**:
- Expo Secure Store for token storage
- Passkey (WebAuthn/FIDO2) support with react-native-passkeys
- Dynamic module loading for passkey functionality
- PIN-based authentication with server validation
- Biometric authentication (legacy, being phased out)

## TypeScript Configuration

- Uses strict TypeScript with path aliases (`@/*` maps to root directory)
- Extends Expo's base TypeScript configuration
- Includes Expo type generation for typed routes

## Platform Support

- **iOS**: Supports tablets, bundle identifier: com.yourcompany.test2
- **Android**: Package name: com.yourcompany.test2, uses new architecture
- **Web**: Uses Metro bundler with static output
- **URL Scheme**: `myapp://` - Custom scheme for deep linking

## Important Notes

- New React Native architecture is enabled (`newArchEnabled: true`)
- Uses React Native Reanimated for animations
- Includes React Navigation for navigation management
- FontAwesome icons and Expo Symbols are pre-configured
- Splash screen and status bar are managed by Expo
- API base URL configurable via `EXPO_PUBLIC_API_BASE_URL` environment variable
- Mock mode enabled for development (`MOCK_WEB_AUTHN = true` in api.ts)

## Testing

No test suite is configured in this project. Verify functionality manually through the development server or device testing.

## Debug Features

The app includes extensive debug logging and alerts in development:
- API requests/responses are logged to console and shown in alerts
- PIN hashing process shows debug information
- Authentication flow displays detailed debug dialogs
- Mock mode available (`MOCK_WEB_AUTHN = true` in api.ts)

When working on authentication features, these debug outputs help trace the flow and identify issues.