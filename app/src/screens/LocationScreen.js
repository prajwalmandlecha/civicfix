import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { GoogleMaps } from "expo-maps";

const LocationScreen = () => {
  return (
    <View style={styles.container}>
      <GoogleMaps.View style={{ flex: 1 }} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
});

export default LocationScreen;
