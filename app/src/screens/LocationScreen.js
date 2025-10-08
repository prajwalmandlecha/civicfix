import React from "react";
import { View, Text, StyleSheet } from "react-native";

const LocationScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location Screen</Text>
      <Text style={styles.subtitle}>To be implemented</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#999",
  },
});

export default LocationScreen;
