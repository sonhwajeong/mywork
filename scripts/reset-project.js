#!/usr/bin/env node

/**
 * This script is used to reset the project to a blank state.
 * It moves the /app folder to /app-example and creates a new /app folder with an index.tsx file.
 * You can remove the `reset-project` script from package.json and safely delete this file after running it.
 */

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const oldDirPath = path.join(root, 'app');
const newDirPath = path.join(root, 'app-example');
const newAppDirPath = path.join(root, 'app');

const indexContent = `import { Text, View } from "react-native";

export default function Index() {
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <Text>Edit app/index.tsx to edit this screen.</Text>
    </View>
  );
}
`;

const layoutContent = `import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" />
    </Stack>
  );
}
`;

async function resetProject() {
  try {
    // Check if /app directory exists
    if (!fs.existsSync(oldDirPath)) {
      console.log('🚨 /app directory does not exist.');
      return;
    }

    // Check if /app-example directory already exists
    if (fs.existsSync(newDirPath)) {
      console.log('🚨 /app-example directory already exists. Please remove it and try again.');
      return;
    }

    // Rename /app to /app-example
    fs.renameSync(oldDirPath, newDirPath);
    console.log('✅ /app directory renamed to /app-example.');

    // Create new /app directory
    fs.mkdirSync(newAppDirPath);

    // Create /app/index.tsx
    fs.writeFileSync(path.join(newAppDirPath, 'index.tsx'), indexContent);

    // Create /app/_layout.tsx
    fs.writeFileSync(path.join(newAppDirPath, '_layout.tsx'), layoutContent);

    console.log('✅ New /app directory created with index.tsx and _layout.tsx.');
    console.log('✅ Project reset complete. You can now remove this script from package.json.');

  } catch (error) {
    console.error('❌ Error resetting project:', error);
  }
}

resetProject();