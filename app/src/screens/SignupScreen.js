import React, { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { MaterialIcons } from "@expo/vector-icons";
import { useActionSheet } from "@expo/react-native-action-sheet";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, firestore } from "../services/firebase";
import { doc, setDoc } from "firebase/firestore";
import CustomTextInput from "../components/CustomTextInput";
import Button from "../components/Button";
import Card from "../components/Card";
import Logo from "../components/Logo";

const SignupScreen = ({ navigation }) => {
  const { showActionSheetWithOptions } = useActionSheet();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userType, setUserType] = useState("");
  const [loading, setLoading] = useState(false);

  const openUserTypePicker = () => {
    Keyboard.dismiss();
    const options = ["Citizen", "Volunteer", "Cancel"];
    const cancelButtonIndex = 2;
    showActionSheetWithOptions(
      { options, cancelButtonIndex },
      (selectedIndex) => {
        if (selectedIndex === 0) setUserType("citizen");
        if (selectedIndex === 1) setUserType("volunteer");
      }
    );
  };

  const handleSignup = async () => {
    if (!name || !email || !password || !userType) {
      alert("Please fill in all fields.");
      return;
    }
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (cred.user) {
        await updateProfile(cred.user, { displayName: name });
      }
      await setDoc(doc(firestore, "users", cred.user.uid), {
        name,
        email,
        userType,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error("Error signing up:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={["#6FCF97", "#A8E6CF"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <KeyboardAwareScrollView
          bottomOffset={200}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Logo size="large" light />
            <Text style={styles.formSubtitle}>
              Create your CivicFix account
            </Text>
          </View>

          <View style={styles.formContainer}>
            <Card style={styles.formCard}>
              <View style={styles.formFields}>
                <CustomTextInput
                  label="Full Name"
                  placeholder="Jane Doe"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                  icon={
                    <MaterialIcons name="person" size={20} color="#9CA3AF" />
                  }
                />

                <CustomTextInput
                  label="Email"
                  placeholder="name@example.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  icon={
                    <MaterialIcons name="email" size={20} color="#9CA3AF" />
                  }
                />

                <CustomTextInput
                  label="Password"
                  placeholder="••••••••"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  autoCapitalize="none"
                  icon={<MaterialIcons name="lock" size={20} color="#9CA3AF" />}
                />

                {/* User Type selector styled like an input */}
                <TouchableOpacity
                  onPress={openUserTypePicker}
                  activeOpacity={0.9}
                >
                  <CustomTextInput
                    label="You are a"
                    placeholder="Select type"
                    value={userType}
                    editable={false}
                    showSoftInputOnFocus={false}
                    onPressIn={openUserTypePicker}
                    icon={
                      <MaterialIcons
                        name="category"
                        size={20}
                        color="#9CA3AF"
                      />
                    }
                  />
                </TouchableOpacity>
              </View>

              <Button
                title="Create Account"
                onPress={handleSignup}
                variant="primary"
                size="large"
                loading={loading}
                disabled={!name || !email || !password || !userType}
              />

              <View style={styles.signupPrompt}>
                <Text style={styles.signupText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.replace("Login")}>
                  <Text style={styles.signupLink}>Sign in</Text>
                </TouchableOpacity>
              </View>
            </Card>
          </View>
        </KeyboardAwareScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

export default SignupScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },
  gradient: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingVertical: 24,
  },
  header: {
    marginBottom: 24,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  formSubtitle: {
    fontSize: 16,
    color: "#FFFFFF",
    lineHeight: 24,
    textAlign: "center",
    marginTop: 8,
    fontWeight: "500",
    opacity: 0.95,
  },
  formContainer: {
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  formCard: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },
  formFields: {
    marginBottom: 8,
  },
  signupPrompt: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  signupText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "400",
  },
  signupLink: {
    fontSize: 14,
    color: "#4CAF79",
    fontWeight: "600",
  },
});
