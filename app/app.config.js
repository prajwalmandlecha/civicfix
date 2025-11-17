const IS_DEV = process.env.APP_VARIANT === 'development';


export default {
  name: IS_DEV ? "CivicFix (Dev)" : "CivicFix",
  slug: "CivicFix",
  version: "1.0.0",
  runtimeVersion: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/icon.png",
    resizeMode: "contain",
    backgroundColor: "#6FCF97",
  },
  ios: {
    supportsTablet: true,
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/icon.png",
      backgroundColor: "#6FCF97",
    },
    edgeToEdgeEnabled: true,
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.RECORD_AUDIO",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.ACCESS_FINE_LOCATION",
    ],
    package: IS_DEV ? "com.prajwal32.CivicFix.dev" : "com.prajwal32.CivicFix",
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow $(PRODUCT_NAME) to access your photos to report a civic issue.",
        cameraPermission:
          "Allow $(PRODUCT_NAME) to use your camera to report a civic issue.",
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow $(PRODUCT_NAME) to use your location to tag the issue.",
      },
    ],
  ],
  extra: {
    eas: {
      projectId: "c7f67732-3e2d-4455-8baf-3b30337961d3",
    },
  },
  updates: {
    url: "https://u.expo.dev/c7f67732-3e2d-4455-8baf-3b30337961d3",
  },
  experiments: {
    reactCompiler: false,
  },
};
