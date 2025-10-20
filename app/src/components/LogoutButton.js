import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { auth } from "../services/firebase";

const LogoutButton = () => {
  return (
    <TouchableOpacity style={styles.container} onPress={() => auth.signOut()}>
      <Text style={styles.text}>Logout</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginRight: 15,
  },
});

export default LogoutButton;
