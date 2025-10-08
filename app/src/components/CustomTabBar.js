import React from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Dimensions,
} from "react-native";
import Svg, { Path } from "react-native-svg";

const { width } = Dimensions.get("window");

// Custom icon components
const HomeIcon = ({ focused }) => (
  <Text style={[styles.iconText, focused && styles.activeIconText]}>⌂</Text>
);

const LocationIcon = ({ focused }) => (
  <Text style={[styles.iconText, focused && styles.activeIconText]}>📍</Text>
);

const StatsIcon = ({ focused }) => (
  <Text style={[styles.iconText, focused && styles.activeIconText]}>📊</Text>
);

const CommunityIcon = ({ focused }) => (
  <Text style={[styles.iconText, focused && styles.activeIconText]}>👥</Text>
);

const ScanIcon = () => (
  <View style={styles.scanIconContainer}>
    <Text style={styles.scanIconText}>📷</Text>
  </View>
);

const TabBarShape = () => {
  const curveWidth = 80;
  const curveHeight = 35;
  const centerX = width / 2;

  const d = `
    M 0,0
    L ${centerX - curveWidth / 2},0
    Q ${centerX - curveWidth / 2},0 ${centerX - curveWidth / 2 + 10},${
    curveHeight / 3
  }
    Q ${centerX},${curveHeight} ${centerX + curveWidth / 2 - 10},${
    curveHeight / 3
  }
    Q ${centerX + curveWidth / 2},0 ${centerX + curveWidth / 2},0
    L ${width},0
    L ${width},70
    L 0,70
    Z
  `;

  return (
    <Svg width={width} height={70} style={styles.svgContainer}>
      <Path d={d} fill="#ffffff" />
    </Svg>
  );
};

const CustomTabBar = ({ state, descriptors, navigation }) => {
  const tabs = [
    { name: "Home", icon: HomeIcon },
    { name: "Location", icon: LocationIcon },
    { name: "Scan", icon: ScanIcon, isCenter: true },
    { name: "Analytics", icon: StatsIcon },
    { name: "Community", icon: CommunityIcon },
  ];

  return (
    <View style={styles.container}>
      {/* Tab bar with curved cutout */}
      <TabBarShape />

      {/* Center scan button */}
      <View style={styles.centerButtonContainer}>
        <TouchableOpacity
          style={styles.centerButton}
          onPress={() => navigation.navigate("Scan")}
          activeOpacity={0.8}
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
              style={styles.tabButton}
              onPress={onPress}
              activeOpacity={0.7}
            >
              <IconComponent focused={isFocused} />
              {isFocused && <View style={styles.activeDot} />}
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
    height: 70,
  },
  svgContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 10,
  },
  centerButtonContainer: {
    position: "absolute",
    top: -25,
    left: width / 2 - 32,
    zIndex: 100,
  },
  centerButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#4285f4",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#4285f4",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.4,
    shadowRadius: 5,
    elevation: 12,
    borderWidth: 4,
    borderColor: "#fff",
  },
  scanIconContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  scanIconText: {
    fontSize: 28,
  },
  tabsContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 70,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 50,
  },
  iconText: {
    fontSize: 26,
    color: "#9ca3af",
  },
  activeIconText: {
    color: "#4285f4",
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#4285f4",
    marginTop: 4,
  },
  spacer: {
    width: 64,
  },
});

export default CustomTabBar;
