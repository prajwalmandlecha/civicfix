import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import HomeScreen from "./screens/HomeScreen";
import LocationScreen from "./screens/LocationScreen";
import LeaderboardScreen from "./screens/LeaderboardScreen";
import ProfileScreen from "./screens/ProfileScreen";
import IssueUploadScreen from "./screens/IssueUploadScreen";
import CustomTabBar from "./components/CustomTabBar";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { createStackNavigator } from "@react-navigation/stack";
import LoginScreen from "./screens/LoginScreen";

import { auth } from "./services/firebase";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";

const Tab = createBottomTabNavigator();

const Stack = createStackNavigator();

const StackNav = () => (
  <Stack.Navigator
    screenOptions={{
      headerStyle: {
        backgroundColor: "#ffffff",
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
      },
      headerTitleStyle: {
        fontWeight: "700",
        fontSize: 20,
        color: "#1a1a1a",
      },
      headerTintColor: "#4285f4",
    }}
  >
    <Stack.Screen
      name="Login"
      component={LoginScreen}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

const TabNav = () => (
  <Tab.Navigator
    screenOptions={{
      headerStyle: {
        backgroundColor: "#ffffff",
        elevation: 0,
        shadowOpacity: 0,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
      },
      headerTitleStyle: {
        fontWeight: "700",
        fontSize: 20,
        color: "#1a1a1a",
      },
      tabBarActiveTintColor: "#6FCF97",
      headerTintColor: "#4285f4",
    }}
  >
    <Tab.Screen
      name="Home"
      component={HomeScreen}
      options={{
        headerTitle: "CivicFix Feed",
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name="home" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Location"
      component={LocationScreen}
      options={{
        headerTitle: "Nearby Issues",
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name="location-on" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="IssueUpload"
      component={IssueUploadScreen}
      options={{
        headerTitle: "Report Issues",
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name="add-circle" size={size} color={"#4285f4"} />
        ),
      }}
    />
    <Tab.Screen
      name="Leaderboard"
      component={LeaderboardScreen}
      options={{
        headerTitle: "Leaderboard",
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name="bar-chart" size={size} color={color} />
        ),
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        headerTitle: "Profile",
        tabBarIcon: ({ color, size }) => (
          <MaterialIcons name="person" size={size} color={color} />
        ),
      }}
    />
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
      console.log("Verifying user token...");
    });

    return () => unsubscribe();
  }, []);

  const user = "";

  return (
    <SafeAreaProvider>
      <ActionSheetProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          {user ? <TabNav /> : <StackNav />}
        </NavigationContainer>
      </ActionSheetProvider>
    </SafeAreaProvider>
  );
}
