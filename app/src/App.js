import { useEffect } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import HomeScreen from "./screens/HomeScreen";
import LocationScreen from "./screens/LocationScreen";
import AnalyticsScreen from "./screens/AnalyticsScreen";
import CommunityScreen from "./screens/CommunityScreen";
import IssueUploadScreen from "./screens/IssueUploadScreen";
import CustomTabBar from "./components/CustomTabBar";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { auth } from "./services/firebase";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";

const Tab = createBottomTabNavigator();

const TabNav = () => (
  <Tab.Navigator
    tabBar={(props) => <CustomTabBar {...props} />}
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
    <Tab.Screen
      name="Home"
      component={HomeScreen}
      options={{
        headerTitle: "CivicFix Feed",
      }}
    />
    <Tab.Screen
      name="Location"
      component={LocationScreen}
      options={{
        headerTitle: "Nearby Issues",
      }}
    />
    <Tab.Screen
      name="IssueUpload"
      component={IssueUploadScreen}
      options={{
        headerTitle: "Report Issues",
      }}
    />
    <Tab.Screen
      name="Analytics"
      component={AnalyticsScreen}
      options={{
        headerTitle: "Impact Stats",
      }}
    />
    <Tab.Screen
      name="Community"
      component={CommunityScreen}
      options={{
        headerTitle: "Community",
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

  return (
    <SafeAreaProvider>
      <ActionSheetProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <TabNav />
        </NavigationContainer>
      </ActionSheetProvider>
    </SafeAreaProvider>
  );
}
