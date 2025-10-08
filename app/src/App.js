import React, { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { View, Platform } from "react-native";
import Constants from "expo-constants";
import HomeScreen from "./screens/HomeScreen";
import LocationScreen from "./screens/LocationScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import CommunityScreen from "./screens/CommunityScreen";
import ScanScreen from "./screens/ScanScreen";
import CustomTabBar from "./components/CustomTabBar";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "./services/firebase";

const Tab = createBottomTabNavigator();

const TabNav = () => (
  <Tab.Navigator
    tabBar={(props) => <CustomTabBar {...props} />}
    screenOptions={{
      // headerShown: false,
    }}
  >
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="Location" component={LocationScreen} />
    <Tab.Screen name="Scan" component={ScanScreen} />
    <Tab.Screen name="Analytics" component={AnalyticsScreen} />
    <Tab.Screen name="Community" component={CommunityScreen} />
  </Tab.Navigator>
);

const signIn = async () => {
  try {
    await signInAnonymously(auth);
    console.log("User signed in anonymously");
  } catch (error) {
    console.error("Error signing in anonymously:", error);
  }
};

export default function App() {
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log("User is signed in:", user.uid);
      } else {
        console.log("No user is signed in, signing in anonymously...");
        signIn();
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <NavigationContainer>
      <View style={{ height: Constants.statusBarHeight }} />
      <StatusBar style="auto" />
      <TabNav />
    </NavigationContainer>
  );
}
