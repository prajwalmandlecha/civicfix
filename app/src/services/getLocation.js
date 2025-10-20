import * as Location from "expo-location";

export const getCurrentLocation = async (
  setLoadingLocation
) => {
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
      return;
    }

    console.log("Permission granted, fetching location...");
    let location = await Location.getCurrentPositionAsync({});
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
    };
  } catch (error) {
    console.error("❌ Location error:", error);
    alert("Error getting location: " + error.message);
    setLoadingLocation(false);
  }
};
