import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useActionSheet } from "@expo/react-native-action-sheet";
import * as Location from "expo-location";
import api from "../services/api";

const IssueUploadScreen = ({ navigation }) => {
  const [image, setImage] = useState(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { showActionSheetWithOptions } = useActionSheet();

  useEffect(() => {
    getPermissions();
  }, []);

  const getPermissions = async () => {
    let { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      alert("Permission to access location was denied");
      return false;
    }
    return true;
  };

  const getLocation = async () => {
    try {
      setLoadingLocation(true);

      let location = await Location.getCurrentPositionAsync({});
      console.log("📍 Current location:", location);
      setLocation(location);

      // Reverse geocoding
      let geocode = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      console.log("📫 Geocode result:", geocode);

      if (geocode.length > 0) {
        const place = geocode[0];
        if (place.formattedAddress) {
          setAddress(place.formattedAddress);
        } else {
          const addressParts = [
            place.streetNumber,
            place.street,
            place.district,
            place.city,
            place.region,
            place.postalCode,
          ];
          const constructedAddress = addressParts.filter(Boolean).join(", ");
          setAddress(constructedAddress);
        }
      }
      setLoadingLocation(false);
    } catch (error) {
      console.error("❌ Location error:", error);
      alert("Error getting location: " + error.message);
      setLoadingLocation(false);
    }
  };

  const pickFromCamera = async () => {
    try {
      let result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
      }
    } catch (e) {
      console.error("Camera error:", e);
    }
  };

  const pickFromLibrary = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled) {
        setImage(result.assets[0].uri);
      }
    } catch (e) {
      console.error("Library error:", e);
    }
  };

  const pickImage = async () => {
    const options = ["Take Photo", "Choose from Library", "Cancel"];

    showActionSheetWithOptions(
      {
        options,
      },
      (selectedIndex) => {
        switch (selectedIndex) {
          case 0:
            pickFromCamera();
            break;
          case 1:
            pickFromLibrary();
            break;
          case 2:
            break;
          default:
            break;
        }
      }
    );
  };

  const handleSubmit = async () => {
    if (!image) {
      Alert.alert("Error", "Please select an image");
      return;
    }
    if (!description.trim()) {
      Alert.alert("Error", "Please provide a description");
      return;
    }
    if (!address.trim()) {
      Alert.alert("Error", "Please provide a location");
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();

      const ext = image.substring(image.lastIndexOf(".") + 1);
      const type = `image/${ext}`;
      console.log("Image :", image);
      formData.append("file", {
        uri: image,
        name: image.substring(image.lastIndexOf("/") + 1),
        type: type,
      });

      formData.append(
        "locationstr",
        JSON.stringify({
          ...location.coords,
          timestamp: location.timestamp,
        })
      );
      formData.append("description", description);
      // formData.append("is_anonymous", isAnonymous);
      const response = await api.post("/submit-issue", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      console.log("Upload successful:", response.data);

      // add to db

      Alert.alert("Success", "Issue reported successfully!", [
        {
          text: "OK",
          onPress: () => {
            setImage(null);
            setDescription("");
            setAddress("");
            setLocation(null);
            setIsAnonymous(false);
          },
        },
      ]);

      navigation.goBack();
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert(
        "Error",
        error.response?.data?.detail ||
          "Failed to upload issue. Please try again."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.formContainer}>
        <TouchableOpacity style={styles.uploadContainer} onPress={pickImage}>
          {image ? (
            <Image source={{ uri: image }} style={styles.uploadedImage} />
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Text style={styles.uploadIcon}>📦</Text>
              <Text style={styles.uploadText}>
                Drag & drop photos or videos
              </Text>
              <Text style={styles.uploadSubtext}>or click to browse</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>📝 Description</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Describe the issue in detail..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.inputGroup}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Text style={styles.label}>📍 Location</Text>
            <TouchableOpacity
              onPress={getLocation}
              disabled={loadingLocation}
              style={{ flexDirection: "row", alignItems: "center" }}
            >
              {loadingLocation ? (
                <ActivityIndicator size="small" color="#4285f4" />
              ) : (
                <Text style={{ color: "#4285f4", fontWeight: "600" }}>
                  Use Current Location
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <TextInput
            style={styles.textInput}
            placeholder="e.g., Main St & 5th Ave"
            value={address}
            onChangeText={setAddress}
          />

          {location && (
            <Text style={styles.coordinatesText}>
              📌 Coordinates: {location.coords.latitude.toFixed(6)},{" "}
              {location.coords.longitude.toFixed(6)}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.anonymousContainer}
          onPress={() => setIsAnonymous(!isAnonymous)}
        >
          <View style={styles.checkbox}>
            {isAnonymous && <View style={styles.checkboxChecked} />}
          </View>
          <Text style={styles.anonymousText}>Anonymous</Text>
        </TouchableOpacity>

        {/* <View style={styles.aiSection}>
          <Text style={styles.aiLabel}>🤖 AI-Detected Issue Types:</Text>
          <View style={styles.tagContainer}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>pothole</Text>
            </View>
          </View>
        </View> */}

        <TouchableOpacity
          style={[
            styles.submitButton,
            image &&
              description &&
              address &&
              !uploading &&
              styles.submitButtonActive,
          ]}
          onPress={handleSubmit}
          disabled={uploading || !image || !description || !address}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              style={[
                styles.submitButtonText,
                image &&
                  description &&
                  address &&
                  styles.submitButtonTextActive,
              ]}
            >
              Submit Issue
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  formContainer: {
    padding: 16,
  },
  uploadContainer: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ddd",
    borderStyle: "dashed",
    minHeight: 200,
    marginBottom: 16,
    overflow: "hidden",
  },
  uploadPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  uploadIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  uploadText: {
    fontSize: 16,
    color: "#333",
    fontWeight: "500",
    marginBottom: 4,
  },
  uploadSubtext: {
    fontSize: 14,
    color: "#888",
  },
  uploadedImage: {
    width: "100%",
    height: 200,
    resizeMode: "cover",
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    fontSize: 14,
  },
  textArea: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    fontSize: 14,
    minHeight: 100,
  },
  coordinatesText: {
    marginTop: 4,
    fontSize: 12,
    color: "#666",
  },
  anonymousContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#ddd",
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: "#5cb85c",
  },
  anonymousText: {
    fontSize: 14,
    color: "#333",
  },
  aiSection: {
    marginBottom: 16,
  },
  aiLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  tagContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tag: {
    backgroundColor: "#fff3cd",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  tagText: {
    fontSize: 12,
    color: "#856404",
  },
  submitButton: {
    backgroundColor: "#ccc",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  submitButtonActive: {
    backgroundColor: "#4285f4",
  },
  submitButtonText: {
    color: "#666",
    fontSize: 16,
    fontWeight: "600",
  },
  submitButtonTextActive: {
    color: "#fff",
  },
});

export default IssueUploadScreen;
