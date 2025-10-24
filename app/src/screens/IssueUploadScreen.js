import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useActionSheet } from "@expo/react-native-action-sheet";
import * as Location from "expo-location";
import api from "../services/api";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { auth } from "../services/firebase";
import { getCurrentLocation } from "../services/getLocation";
import GooglePlacesTextInput from "react-native-google-places-textinput";
import "react-native-get-random-values";
import { getIssueTypesWithNames } from "../utils/issueTypeMapping";
import { Dropdown } from "react-native-element-dropdown";
import Constants from "expo-constants";

const IssueUploadScreen = ({ navigation }) => {
  const [image, setImage] = useState(null);
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(null);
  const [address, setAddress] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [issueTypes, setIssueTypes] = useState([]);
  const { showActionSheetWithOptions } = useActionSheet();

  console.log("test", process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY);

  const issueTypesData = getIssueTypesWithNames();
  const dropdownData = Object.entries(issueTypesData).map(([key, value]) => ({
    label: value,
    value: key,
  }));

  const getLocation = async () => {
    const result = await getCurrentLocation(setLoadingLocation);

    if (!result) {
      return;
    }

    const { addressParts, location, error } = result;

    if (error) {
      console.log("Location error:", error);
      return;
    }

    if (location) {
      setLocation(location);
    }

    if (addressParts) {
      const addr = `${addressParts.street}, ${addressParts.city}, ${addressParts.region}, ${addressParts.country}`;
      setAddress(addr);
    }
  };

  const pickFromCamera = async () => {
    try {
      let result = await ImagePicker.launchCameraAsync({
        mediaType: ImagePicker.MediaTypeOptions.Images,
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
        mediaTypes: ["images"],
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
      formData.append("locationstr", address);
      formData.append("description", description);
      if (issueTypes && issueTypes.length > 0) {
        issueTypes.forEach((label) => {
          formData.append("labels", label);
        });
      }
      formData.append("is_anonymous", isAnonymous.toString());

      // Get the auth token manually to ensure it's included
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "You must be logged in to submit an issue");
        return;
      }
      const token = await user.getIdToken();
      console.log("User authenticated:", user.uid);
      console.log("Token obtained:", token ? "Yes" : "No");

      const response = await api.post("/submit-issue", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000,
      });

      console.log("Upload successful:", response.data);

      // add to db

      if (response.data.no_issues_found) {
        Alert.alert("Notice", "No issues were detected in the uploaded image.");
        return;
      }
      Alert.alert("Success", "Issue reported successfully!", [
        {
          text: "OK",
          onPress: () => {
            setImage(null);
            setDescription("");
            setAddress("");
            setLocation(null);
            setIssueTypes([]);
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
    <KeyboardAwareScrollView
      style={styles.container}
      bottomOffset={250}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.formContainer}>
        <TouchableOpacity style={styles.uploadContainer} onPress={pickImage}>
          {image ? (
            <Image source={{ uri: image }} style={styles.uploadedImage} />
          ) : (
            <View style={styles.uploadPlaceholder}>
              <Text style={styles.uploadIcon}>📦</Text>
              <Text style={styles.uploadText}>Drag & drop photos</Text>
              <Text style={styles.uploadSubtext}>or click to browse</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Issue Types (Optional)</Text>
          <Dropdown
            style={styles.dropdown}
            placeholderStyle={styles.placeholderStyle}
            selectedTextStyle={styles.selectedTextStyle}
            inputSearchStyle={styles.inputSearchStyle}
            iconStyle={styles.iconStyle}
            data={dropdownData}
            search
            maxHeight={300}
            labelField="label"
            valueField="value"
            placeholder="Select issue types (Gemini will add more)"
            searchPlaceholder="Search..."
            value={issueTypes[0] || null}
            onChange={(item) => {
              if (issueTypes.includes(item.value)) {
                setIssueTypes(issueTypes.filter((type) => type !== item.value));
              } else {
                setIssueTypes([...issueTypes, item.value]);
              }
            }}
            renderLeftIcon={() => null}
            flatListProps={{
              nestedScrollEnabled: true,
            }}
            containerStyle={styles.dropdownContainer}
          />
          {issueTypes.length > 0 && (
            <View style={styles.selectedTypesContainer}>
              {issueTypes.map((type) => (
                <View key={type} style={styles.selectedTypeChip}>
                  <Text style={styles.selectedTypeText}>
                    {issueTypesData[type]}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setIssueTypes(issueTypes.filter((t) => t !== type));
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Text style={styles.removeTypeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description</Text>
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
            <Text style={styles.label}>Location</Text>
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

          <GooglePlacesTextInput
            apiKey="AIzaSyCOIcuht3KsQIKVszM9xWNOKim65JopzOk"
            placeHolderText="Search for a location"
            value={address}
            fetchDetails={true}
            detailsFields={[
              "formattedAddress",
              "location",
              "displayName",
              "id",
            ]}
            onPlaceSelect={(place) => {
              console.log("Place selected:", place);
              if (place.details) {
                const newAddress = place.details.formattedAddress;
                console.log("Setting address:", newAddress);
                setAddress(newAddress);
                setLocation({
                  coords: {
                    latitude: place.details.location.latitude,
                    longitude: place.details.location.longitude,
                  },
                });
              }
            }}
            onTextChange={(text) => {
              setAddress(text);
              if (!text) {
                setLocation(null);
              }
            }}
            languageCode="en"
            debounceDelay={300}
            minCharsToFetch={2}
            listViewDisplayed="auto"
            enablePoweredByContainer={false}
            keyboardShouldPersistTaps="handled"
            style={{
              input: styles.textInput,
              container: { marginBottom: 8, zIndex: 1 },
              listView: styles.listView,
            }}
          />

          {location && (
            <Text style={styles.coordinatesText}>
              Coordinates: {location?.coords?.latitude?.toFixed(6)},{" "}
              {location?.coords?.longitude?.toFixed(6)}
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
    </KeyboardAwareScrollView>
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
  dropdown: {
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 12,
  },
  dropdownContainer: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
  },
  placeholderStyle: {
    fontSize: 14,
    color: "#999",
  },
  selectedTextStyle: {
    fontSize: 14,
    color: "#333",
  },
  iconStyle: {
    width: 20,
    height: 20,
  },
  inputSearchStyle: {
    height: 40,
    fontSize: 14,
    borderRadius: 8,
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
  listView: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    marginTop: 4,
    maxHeight: 200,
  },
  selectedTypesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    gap: 8,
  },
  selectedTypeChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#e3f2fd",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  selectedTypeText: {
    fontSize: 13,
    color: "#1976d2",
    fontWeight: "500",
  },
  removeTypeText: {
    fontSize: 16,
    color: "#1976d2",
    fontWeight: "600",
  },
});

export default IssueUploadScreen;
