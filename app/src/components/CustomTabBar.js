import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Dimensions,
  Platform,
} from "react-native";
import Svg, { Path, Defs, LinearGradient, Stop } from "react-native-svg";

const { width } = Dimensions.get("window");

// Custom icon components with better styling
const HomeIcon = ({ focused }) => (
  <View style={styles.iconWrapper}>
    <Text style={[styles.iconText, focused && styles.activeIconText]}>⌂</Text>
    {focused && <Text style={styles.iconLabel}>Home</Text>}
  </View>
);

const LocationIcon = ({ focused }) => (
  <View style={styles.iconWrapper}>
    <Text style={[styles.iconText, focused && styles.activeIconText]}>📍</Text>
    {focused && <Text style={styles.iconLabel}>Map</Text>}
  </View>
);

const StatsIcon = ({ focused }) => (
  <View style={styles.iconWrapper}>
    <Text style={[styles.iconText, focused && styles.activeIconText]}>📊</Text>
    {focused && <Text style={styles.iconLabel}>Stats</Text>}
  </View>
);

const CommunityIcon = ({ focused }) => (
  <View style={styles.iconWrapper}>
    <Text style={[styles.iconText, focused && styles.activeIconText]}>👥</Text>
    {focused && <Text style={styles.iconLabel}>Social</Text>}
  </View>
);

const ScanIcon = () => (
  <View style={styles.scanIconContainer}>
    <View style={styles.cameraBody}>
      <View style={styles.cameraLens} />
      <View style={styles.cameraFlash} />
    </View>
  </View>
);

const TabBarShape = () => {
  const curveWidth = 90;
  const curveHeight = 40;
  const centerX = width / 2;

  const d = `
    M 0,0
    L ${centerX - curveWidth / 2},0
    Q ${centerX - curveWidth / 2},0 ${centerX - curveWidth / 2 + 12},${
    curveHeight / 2.5
  }
    Q ${centerX},${curveHeight + 5} ${centerX + curveWidth / 2 - 12},${
    curveHeight / 2.5
  }
    Q ${centerX + curveWidth / 2},0 ${centerX + curveWidth / 2},0
    L ${width},0
    L ${width},75
    L 0,75
    Z
  `;

  return (
    <Svg width={width} height={75} style={styles.svgContainer}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#ffffff" stopOpacity="1" />
          <Stop offset="0.5" stopColor="#fafbfc" stopOpacity="1" />
          <Stop offset="1" stopColor="#f8f9fa" stopOpacity="1" />
        </LinearGradient>
      </Defs>
      <Path d={d} fill="url(#grad)" />
    </Svg>
  );
};

const CustomTabBar = ({ state, descriptors, navigation }) => {
  // Hide tab bar when on Scan screen
  const currentRoute = state.routes[state.index];
  if (currentRoute.name === "IssueUpload") {
    return null;
  }

  const tabs = [
    { name: "Home", icon: HomeIcon },
    { name: "Location", icon: LocationIcon },
    { name: "IssueUpload", icon: ScanIcon, isCenter: true },
    { name: "Analytics", icon: StatsIcon },
    { name: "Community", icon: CommunityIcon },
  ];

  return (
    <View style={styles.container}>
      {/* Tab bar with curved cutout */}
      <TabBarShape />

      {/* Center scan button with pulse animation effect */}
      <View style={styles.centerButtonContainer}>
        <View style={styles.pulseOuter} />
        <View style={styles.pulseMiddle} />
        <TouchableOpacity
          style={styles.centerButton}
          onPress={() => navigation.navigate("IssueUpload")}
          activeOpacity={0.7}
        >
          <ScanIcon />
        </TouchableOpacity>
      </View>

      {/* Tab buttons */}
      <View style={styles.tabsContainer}>
        {tabs.map((tab, index) => {
          if (tab.isCenter) return <View key={index} style={styles.spacer} />;

          const routeIndex = state.routes.findIndex(
            (route) => route.name === tab.name
          );
          const isFocused = state.index === routeIndex;
          const IconComponent = tab.icon;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: state.routes[routeIndex].key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(tab.name);
            }
          };

          return (
            <TouchableOpacity
              key={index}
              style={[styles.tabButton, isFocused && styles.tabButtonActive]}
              onPress={onPress}
              activeOpacity={0.6}
            >
              <IconComponent focused={isFocused} />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 75,
  },
  svgContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  centerButtonContainer: {
    position: "absolute",
    top: -32,
    left: width / 2 - 36,
    zIndex: 100,
  },
  pulseOuter: {
    position: "absolute",
    top: -8,
    left: -8,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#4285f4",
    opacity: 0.12,
  },
  pulseMiddle: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#4285f4",
    opacity: 0.18,
  },
  centerButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#4285f4",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4285f4",
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 20,
    borderWidth: 6,
    borderColor: "#fff",
    ...Platform.select({
      ios: {
        shadowColor: "#4285f4",
      },
      android: {
        elevation: 22,
      },
    }),
  },
  scanIconContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  cameraBody: {
    width: 36,
    height: 28,
    backgroundColor: "#ffffff",
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cameraLens: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#4285f4",
    borderWidth: 2,
    borderColor: "#ffffff",
  },
  cameraFlash: {
    position: "absolute",
    top: 4,
    right: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#fbbc04",
  },
  scanIconText: {
    fontSize: 32,
  },
  tabsContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 75,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 22 : 16,
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    minWidth: 65,
    borderRadius: 14,
  },
  tabButtonActive: {
    backgroundColor: "#f0f7ff",
    shadowColor: "#4285f4",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  iconWrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  iconText: {
    fontSize: 26,
    color: "#9ca3af",
    ...Platform.select({
      ios: {
        textShadowColor: "rgba(0, 0, 0, 0.08)",
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
      },
    }),
  },
  activeIconText: {
    color: "#4285f4",
    transform: [{ scale: 1.15 }],
  },
  iconLabel: {
    fontSize: 10,
    color: "#4285f4",
    fontWeight: "700",
    marginTop: 3,
    letterSpacing: 0.4,
  },
  spacer: {
    width: 72,
  },
});

export default CustomTabBar;
