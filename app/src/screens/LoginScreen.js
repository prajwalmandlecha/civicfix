import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import React, { useState } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import CustomTextInput from "../components/CustomTextInput";
import Button from "../components/Button";
import Card from "../components/Card";
import Logo from "../components/Logo";
import { LinearGradient } from "expo-linear-gradient";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { auth } from "../services/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

const LoginScreen = ({ navigation }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      case "auth/user-not-found":
        return "No account found with this email.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again.";
      case "auth/invalid-credential":
        return "Invalid email or password. Please try again.";
      case "auth/too-many-requests":
        return "Too many failed attempts. Please try again later.";
      case "auth/network-request-failed":
        return "Network error. Please check your connection.";
      default:
        return "Login failed. Please try again.";
    }
  };

  const handleLogin = async () => {
    // Clear previous error
    setError("");

    // Validate inputs
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      console.error("Error signing in:", error);
      setError(getErrorMessage(error.code));
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
          bottomOffset={180}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Logo size="large" light />
            <Text style={styles.formSubtitle}>
              Sign in to continue improving your city
            </Text>
          </View>
          <View style={styles.formContainer}>
            <Card style={styles.formCard}>
              {error ? (
                <View style={styles.errorContainer}>
                  <MaterialIcons
                    name="error-outline"
                    size={20}
                    color="#DC2626"
                  />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              <View style={styles.formFields}>
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
                  icon={<MaterialIcons name="lock" size={20} color="#9CA3AF" />}
                />

                <TouchableOpacity style={styles.forgotPassword}>
                  <Text style={styles.forgotPasswordText}>
                    Forgot password?
                  </Text>
                </TouchableOpacity>
              </View>

              <Button
                title="Sign In"
                onPress={handleLogin}
                variant="primary"
                size="large"
                loading={loading}
              />

              <View style={styles.signupPrompt}>
                <Text style={styles.signupText}>Don't have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
                  <Text style={styles.signupLink}>Create one</Text>
                </TouchableOpacity>
              </View>
            </Card>

            {/* <View style={styles.footer}>
              <Text style={styles.footerText}>
                By signing in, you agree to help improve your community
              </Text>
            </View> */}
          </View>
        </KeyboardAwareScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

export default LoginScreen;

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
  formContainer: {
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  formCard: {
    // Card component already has padding: 24, no need to override
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
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
  forgotPassword: {
    alignSelf: "flex-end",
    marginTop: 4,
    marginBottom: 16,
  },
  forgotPasswordText: {
    color: "#4CAF79",
    fontSize: 14,
    fontWeight: "600",
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEE2E2",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    color: "#DC2626",
    fontSize: 14,
    fontWeight: "500",
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
  footer: {
    marginTop: 20,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: "#FFFFFF",
    textAlign: "center",
    opacity: 0.85,
    lineHeight: 18,
  },
});
