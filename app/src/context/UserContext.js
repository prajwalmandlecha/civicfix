import React, { createContext, useState, useContext, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, firestore } from "../services/firebase";

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
        if (data.lastLocation) {
          setLastLocation(data.lastLocation);
        }
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
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
