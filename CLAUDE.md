# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native mobile application built with Expo and Expo Router. It uses TypeScript and includes both iOS and Android platform support with a tab-based navigation structure.

## Development Commands

- `npm start` - Start Expo development server
- `npm run android` - Run on Android device/emulator
- `npm run ios` - Run on iOS device/simulator
- `npm run web` - Run web version
- `npm run lint` - Run ESLint code linting
- `npm run reset-project` - Reset to blank app (moves current app to app-example)

## Android Development

For Android builds, use the Gradle wrapper in the android directory:
- `cd android && ./gradlew assembleDebug` - Build debug APK
- `cd android && ./gradlew clean` - Clean Android build

## Architecture

**Routing**: Uses Expo Router with file-based routing. Main app structure is in `/app` directory.

**Navigation Structure**:
- Root layout: `/app/_layout.tsx` - Handles font loading, splash screen, and theme provider
- Tab layout: `/app/(tabs)/_layout.tsx` - Bottom tab navigation with Home and Explore tabs
- Screens: `/app/(tabs)/index.tsx` (Home), `/app/(tabs)/explore.tsx`

**Styling System**:
- Themed components in `/components` directory (ThemedText, ThemedView, etc.)
- Color system defined in `/constants/Colors.ts` with light/dark mode support
- Custom hooks for theme management in `/hooks` directory
- Metro config includes NativeWind for Tailwind-like styling (references global.css)

**Key Directories**:
- `/app` - Main application screens and routing
- `/components` - Reusable UI components with theming support
- `/constants` - App-wide constants including Colors
- `/hooks` - Custom React hooks (useColorScheme, useThemeColor)
- `/utils` - Utility functions
- `/types` - TypeScript type definitions
- `/android` - Android-specific build files and native code

## TypeScript Configuration

- Uses strict TypeScript with path aliases (`@/*` maps to root directory)
- Extends Expo's base TypeScript configuration
- Includes Expo type generation for typed routes

## Platform Support

- **iOS**: Supports tablets, bundle identifier: com.yourcompany.test2
- **Android**: Package name: com.yourcompany.test2, uses new architecture
- **Web**: Uses Metro bundler with static output

## Important Notes

- New React Native architecture is enabled (`newArchEnabled: true`)
- Uses React Native Reanimated for animations
- Includes React Navigation for navigation management
- FontAwesome icons are pre-configured
- Splash screen and status bar are managed by Expo