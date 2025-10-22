import * as Location from "expo-location";
import { Alert, Platform } from "react-native";



export const getCurrentLocation = async (setLoadingLocation) => {
  try {
    setLoadingLocation(true);

    let { status } = await Location.getForegroundPermissionsAsync();

    if (status !== "granted") {
      console.log("Permission not granted, requesting...");
      let { status: newStatus } =
        await Location.requestForegroundPermissionsAsync();
      status = newStatus;
    }

    if (status !== "granted") {
      Alert.alert(
        "Permission Denied",
        "Permission to access location was denied. Please enable it in your device settings."
      );
      setLoadingLocation(false);
      return { location: null, addressParts: null, error: "permission_denied" };
    }

    // Check if location services are enabled
    const isLocationEnabled = await Location.hasServicesEnabledAsync();
    if (!isLocationEnabled) {
      Alert.alert(
        "Location Services Disabled",
        "Please enable location services in your device settings to use this feature.",
        [
          {
            text: "OK",
            onPress: () => {
              setLoadingLocation(false);
            },
          },
        ]
      );
      setLoadingLocation(false);
      return { location: null, addressParts: null, error: "services_disabled" };
    }

    console.log("Permission granted, fetching location...");
    let location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
      timeInterval: 5000,
      distanceInterval: 0,
    });
    console.log("📍 Current location:", location);

    // Reverse geocoding
    let geocode = await Location.reverseGeocodeAsync({
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    });

    console.log("📫 Geocode result:", geocode);

    let addressParts;

    if (geocode.length > 0) {
      const address = geocode[0];
      addressParts = {
        street: address.street || "",
        city: address.city || "",
        region: address.region || "",
        postalCode: address.postalCode || "",
        country: address.country || "",
      };
    }
    setLoadingLocation(false);

    return {
      location,
      addressParts,
      error: null,
    };
  } catch (error) {
    console.error("❌ Location error:", error);

    let errorMessage = "Error getting location. ";
    if (error.message.includes("Location request timed out")) {
      errorMessage +=
        "Location request timed out. Please check if location services are enabled.";
    } else if (error.message.includes("Location provider is unavailable")) {
      errorMessage +=
        "Location services are unavailable. Please enable them in settings.";
    } else {
      errorMessage += error.message;
    }

    Alert.alert("Location Error", errorMessage);
    setLoadingLocation(false);
    return { location: null, addressParts: null, error: error.message };
  }
};
