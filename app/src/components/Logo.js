import React from "react";
import { View, Text, StyleSheet, Image } from "react-native";

const Logo = ({ light = false }) => {
  return (
    <View style={styles.container}>
      <Image
        source={require("../../assets/iconblue.png")}
        style={styles.icon}
        resizeMode="contain"
      />
      <Text style={[styles.text, light && styles.textLight]}>CivicFix</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  icon: {
    width: 60,
    height: 60,
  },
  text: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1F2937",
  },
  textLight: {
    color: "#FFFFFF",
  },
});

export default Logo;
