import React, { createContext, useState, useContext, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, firestore } from "../services/firebase";
import * as Location from "expo-location";

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [lastLocation, setLastLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userType, setUserType] = useState(null);

  const fetchUserProfile = async (uid) => {
    try {
      const userDoc = await getDoc(doc(firestore, "users", uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        setProfile(data);
        setUserType(data.userType || null);
        if (data.lastLocation) {
          setLastLocation(data.lastLocation);
        } else {
          // If no location stored, try to get current location automatically
          console.log("No stored location found, fetching current location...");
          await fetchAndSetInitialLocation(uid);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    }
  };

  const fetchAndSetInitialLocation = async (uid) => {
    try {
      // Check if we have location permission
      let { status } = await Location.getForegroundPermissionsAsync();

      if (status !== "granted") {
        console.log("Location permission not granted, requesting...");
        const { status: newStatus } =
          await Location.requestForegroundPermissionsAsync();
        status = newStatus;
      }

      if (status !== "granted") {
        console.log("Location permission denied by user");
        return;
      }

      // Check if location services are enabled
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        console.log("Location services are disabled");
        return;
      }

      console.log("Fetching initial location...");
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Get address
      const geocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      let address = "Current Location";
      if (geocode.length > 0) {
        const addressData = geocode[0];
        address = [
          addressData.street,
          addressData.city,
          addressData.region,
          addressData.postalCode,
          addressData.country,
        ]
          .filter(Boolean)
          .join(", ");
      }

      const locationData = {
        coords: {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        },
        address: address,
      };

      // Update context state
      setLastLocation(locationData);

      // Save to Firestore
      await updateDoc(doc(firestore, "users", uid), {
        lastLocation: locationData,
        lastLocationUpdated: new Date().toISOString(),
      });

      console.log("Initial location set successfully:", address);
    } catch (error) {
      console.error("Error fetching initial location:", error);
      // Don't throw - we want the app to continue even if location fetch fails
    }
  };

  const updateLastLocation = async (location) => {
    setLastLocation(location);
    if (user) {
      try {
        await updateDoc(doc(firestore, "users", user.uid), {
          lastLocation: location,
          lastLocationUpdated: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Error updating last location:", error);
      }
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        await fetchUserProfile(firebaseUser.uid);
      } else {
        setProfile(null);
        setLastLocation(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <UserContext.Provider
      value={{
        user,
        profile,
        userType,
        lastLocation,
        loading,
        updateLastLocation,
        refreshProfile: () => user && fetchUserProfile(user.uid),
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUserContext = () => {
  return useContext(UserContext);
};
