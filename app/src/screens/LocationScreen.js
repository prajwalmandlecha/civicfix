import React, { useRef } from "react";
import { StyleSheet, View } from "react-native";
import { GoogleMaps } from "expo-maps";
import { useUserContext } from "../context/UserContext";

const MapScreen = () => {
  return (
    <View style={styles.container}>
      <GoogleMaps.View
        style={{ flex: 1 }}
        cameraPosition={{
          coordinates: { latitude: 18.486, longitude: 73.797 },
          zoom: 15,
        }}
      />
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

export default MapScreen;
