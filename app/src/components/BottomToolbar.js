import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Dimensions,
} from "react-native";

const { width } = Dimensions.get("window");

// Custom icon components using text symbols
const HomeIcon = ({ active }) => (
  <Text style={[styles.iconText, active && styles.activeIconText]}>⌂</Text>
);

const LocationIcon = ({ active }) => (
  <Text style={[styles.iconText, active && styles.activeIconText]}>📍</Text>
);

const StatsIcon = ({ active }) => (
  <Text style={[styles.iconText, active && styles.activeIconText]}>📊</Text>
);

const CommunityIcon = ({ active }) => (
  <Text style={[styles.iconText, active && styles.activeIconText]}>👥</Text>
);

const ScanIcon = () => (
  <View style={styles.scanIconContainer}>
    <View style={styles.scanIconBorder}>
      <Text style={styles.scanIconText}>⌘</Text>
    </View>
  </View>
);

const BottomToolbar = ({ onTabPress }) => {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = [
    { id: 0, icon: HomeIcon, label: "Home" },
    { id: 1, icon: LocationIcon, label: "Location" },
    { id: 2, icon: StatsIcon, label: "Analytics" },
    { id: 3, icon: CommunityIcon, label: "Community" },
  ];

  const handleTabPress = (tabId) => {
    setActiveTab(tabId);
    if (onTabPress) {
      onTabPress(tabId);
    }
  };

  const handleScanPress = () => {
    if (onTabPress) {
      onTabPress("scan");
    }
  };

  return (
    <View style={styles.container}>
      {/* Center scan button */}
      <View style={styles.centerButtonContainer}>
        <TouchableOpacity style={styles.centerButton} onPress={handleScanPress}>
          <ScanIcon />
        </TouchableOpacity>
      </View>

      {/* Bottom toolbar */}
      <View style={styles.toolbar}>
        {/* First two tabs */}
        {tabs.slice(0, 2).map((tab) => {
          const IconComponent = tab.icon;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabButton}
              onPress={() => handleTabPress(tab.id)}
            >
              <View
                style={[
                  styles.iconContainer,
                  activeTab === tab.id && styles.activeIconContainer,
                ]}
              >
                <IconComponent active={activeTab === tab.id} />
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Spacer for center button */}
        <View style={styles.spacer} />

        {/* Last two tabs */}
        {tabs.slice(2).map((tab) => {
          const IconComponent = tab.icon;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tabButton}
              onPress={() => handleTabPress(tab.id)}
            >
              <View
                style={[
                  styles.iconContainer,
                  activeTab === tab.id && styles.activeIconContainer,
                ]}
              >
                <IconComponent active={activeTab === tab.id} />
              </View>
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
  },
  centerButtonContainer: {
    position: "absolute",
    top: -30,
    left: width / 2 - 30,
    zIndex: 10,
  },
  centerButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#4285f4",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
    borderWidth: 3,
    borderColor: "#fff",
  },
  scanIconContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  scanIconBorder: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  scanIconText: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#e8eaed",
    paddingBottom: 25, // Account for safe area
  },
  tabButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
  },
  activeIconContainer: {
    backgroundColor: "#4285f4",
  },
  iconText: {
    fontSize: 24,
    color: "#5f6368",
  },
  activeIconText: {
    color: "#fff",
  },
  spacer: {
    width: 60, // Space for center button
  },
});

export default BottomToolbar;
