import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

const StatCard = ({ icon, number, label, size = "medium" }) => {
  const isSmall = size === "small";

  return (
    <View style={[styles.container, isSmall && styles.containerSmall]}>
      <View
        style={[styles.iconContainer, isSmall && styles.iconContainerSmall]}
      >
        <Ionicons name={icon} size={isSmall ? 28 : 36} color="#4CAF79" />
      </View>
      <Text style={[styles.number, isSmall && styles.numberSmall]}>
        {number}
      </Text>
      <Text style={[styles.label, isSmall && styles.labelSmall]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  containerSmall: {
    borderRadius: 16,
    padding: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E8F5E9",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  iconContainerSmall: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 8,
  },
  number: {
    fontSize: 32,
    fontWeight: "700",
    color: "#4CAF79",
    marginBottom: 8,
  },
  numberSmall: {
    fontSize: 20,
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  labelSmall: {
    fontSize: 10,
  },
});

export default StatCard;
