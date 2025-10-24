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
import FixUploadScreen from "./screens/FixUploadScreen";
import { createStackNavigator } from "@react-navigation/stack";
import LoginScreen from "./screens/LoginScreen";
import SignupScreen from "./screens/SignupScreen";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { KeyboardProvider } from "react-native-keyboard-controller";
import subscribeToAuthState from "./hooks/subscribeToAuthState";
import { ActivityIndicator } from "react-native";
import LogoutButton from "./components/LogoutButton";
import { UserProvider, useUserContext } from "./context/UserContext";
import * as Updates from "expo-updates";
import { useEffect } from "react";

async function checkForUpdates() {
  try {
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch (error) {
    console.log("Error checking for updates:", error);
  }
}

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const RootStack = createStackNavigator();

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
    <Stack.Screen
      name="Signup"
      component={SignupScreen}
      options={{ headerShown: false }}
    />
  </Stack.Navigator>
);

const TabNav = () => {
  const { userType } = useUserContext();

  return (
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
        headerRight: () => <LogoutButton />,
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
      {/* Only show IssueUpload tab for citizens (NOT NGOs) */}
      {userType === "citizen" && (
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
      )}
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
};

const MainNav = () => {
  const { user } = useUserContext();

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <RootStack.Screen name="Tabs" component={TabNav} />
          <RootStack.Screen
            name="FixUpload"
            component={FixUploadScreen}
            options={{
              headerShown: true,
              headerTitle: "Upload Fix",
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
          />
        </>
      ) : (
        <RootStack.Screen name="Auth" component={StackNav} />
      )}
    </RootStack.Navigator>
  );
};

export default function App() {
  const { user, loading } = subscribeToAuthState();

  useEffect(() => {
    checkForUpdates();
  }, []);

  if (loading) {
    return <ActivityIndicator size="large" color="#6FCF97" />;
  }

  return (
    <SafeAreaProvider>
      <ActionSheetProvider>
        <KeyboardProvider>
          <UserProvider>
            <NavigationContainer>
              <StatusBar style="dark" />
              <MainNav />
            </NavigationContainer>
          </UserProvider>
        </KeyboardProvider>
      </ActionSheetProvider>
    </SafeAreaProvider>
  );
}
