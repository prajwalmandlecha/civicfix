import { useState } from "react";
import * as Location from "expo-location";
import { Alert } from "react-native";

/**
 * Custom hook for location operations
 * @returns {Object} Location utilities
 */
export const useLocation = () => {
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);

  /**
   * Request location permissions
   */
  const requestPermissions = async () => {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();

      if (status !== "granted") {
        const { status: newStatus } =
          await Location.requestForegroundPermissionsAsync();
        status = newStatus;
      }

      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to use this feature"
        );
        return false;
      }

      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        Alert.alert(
          "Location Services Disabled",
          "Please enable location services in your device settings."
        );
        return false;
      }

      return true;
    } catch (error) {
      console.error("Permission error:", error);
      return false;
    }
  };

  /**
   * Get current location with address
   */
  const getCurrentLocation = async () => {
    setLoading(true);
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission) {
        setLoading(false);
        return null;
      }

      const locationResult = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = locationResult.coords;
      const locationData = {
        coords: { latitude, longitude },
      };

      const addressResult = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (addressResult && addressResult.length > 0) {
        const addressParts = addressResult[0];
        const formattedAddress = [
          addressParts.name || addressParts.street,
          addressParts.city,
          addressParts.region,
          addressParts.country,
        ]
          .filter(Boolean)
          .join(", ");

        setAddress(formattedAddress);
        setLocation(locationData);
        setLoading(false);

        return {
          location: locationData,
          address: formattedAddress,
          addressParts,
        };
      }

      setLocation(locationData);
      setLoading(false);
      return { location: locationData, address: "", addressParts: null };
    } catch (error) {
      console.error("Error getting location:", error);
      setLoading(false);

      let errorMessage = "Failed to get your location";
      if (error.message.includes("timed out")) {
        errorMessage =
          "Location request timed out. Please check if location services are enabled.";
      } else if (error.message.includes("unavailable")) {
        errorMessage =
          "Location services are unavailable. Please enable them in settings.";
      }

      Alert.alert("Location Error", errorMessage);
      return null;
    }
  };

  /**
   * Reverse geocode a location to get address
   */
  const reverseGeocode = async (latitude, longitude) => {
    try {
      const addressResult = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (addressResult && addressResult.length > 0) {
        const addressParts = addressResult[0];
        return [addressParts.name || addressParts.street, addressParts.city]
          .filter(Boolean)
          .join(", ");
      }
      return "Unknown location";
    } catch (error) {
      console.error("Geocoding error:", error);
      return "Unknown location";
    }
  };

  /**
   * Reset location state
   */
  const resetLocation = () => {
    setLocation(null);
    setAddress("");
  };

  return {
    location,
    address,
    loading,
    setLocation,
    setAddress,
    getCurrentLocation,
    reverseGeocode,
    resetLocation,
    requestPermissions,
  };
};
