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
import { useActionSheet } from "@expo/react-native-action-sheet";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import GooglePlacesTextInput from "react-native-google-places-textinput";
import { Dropdown } from "react-native-element-dropdown";
import { getIssueTypesWithNames } from "../utils/issueTypeMapping";
import { useImagePicker } from "../hooks/useImagePicker";
import { useLocation } from "../hooks/useLocation";
import { useUpload } from "../hooks/useUpload";

const IssueUploadScreen = ({ navigation }) => {
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [issueTypes, setIssueTypes] = useState([]);
  const { showActionSheetWithOptions } = useActionSheet();

  // Use custom hooks
  const { image, setImage, pickFromCamera, pickFromLibrary } = useImagePicker();
  const { location, address, setLocation, setAddress, loading: loadingLocation, getCurrentLocation } = useLocation();
  const { uploading, uploadIssue } = useUpload();

  const issueTypesData = getIssueTypesWithNames();
  const dropdownData = Object.entries(issueTypesData).map(([key, value]) => ({
    label: value,
    value: key,
  }));

  const handleGetLocation = async () => {
    const result = await getCurrentLocation();
    if (result) {
      setLocation(result.location);
      setAddress(result.address);
    }
  };

  const pickImage = async () => {
    const options = ["Take Photo", "Choose from Library", "Cancel"];

    showActionSheetWithOptions({ options }, async (selectedIndex) => {
      switch (selectedIndex) {
        case 0:
          await pickFromCamera();
          break;
        case 1:
          await pickFromLibrary();
          break;
      }
    });
  };

  const handleSubmit = async () => {
    const result = await uploadIssue({
      image,
      description,
      address,
      issueTypes,
      isAnonymous,
    });

    if (result.success && !result.noIssuesFound) {
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
            navigation.goBack();
          },
        },
      ]);
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
            flatListProps={{ nestedScrollEnabled: true }}
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
          <View style={styles.locationHeader}>
            <Text style={styles.label}>Location</Text>
            <TouchableOpacity
              onPress={handleGetLocation}
              disabled={loadingLocation}
              style={styles.locationButton}
            >
              {loadingLocation ? (
                <ActivityIndicator size="small" color="#4285f4" />
              ) : (
                <Text style={styles.locationButtonText}>
                  Use Current Location
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <GooglePlacesTextInput
            apiKey="AIzaSyArWfe-AqvplAJwvwmZC-QonAr4kmlTRjk"
            placeHolderText="Search for a location"
            value={address}
            fetchDetails={true}
            detailsFields={["formattedAddress", "location", "displayName", "id"]}
            onPlaceSelect={(place) => {
              if (place.details) {
                setAddress(place.details.formattedAddress);
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
              if (!text) setLocation(null);
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
            image && description && address && !uploading && styles.submitButtonActive,
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
                image && description && address && styles.submitButtonTextActive,
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
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  formContainer: { padding: 16 },
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
  uploadIcon: { fontSize: 48, marginBottom: 12 },
  uploadText: { fontSize: 16, color: "#333", fontWeight: "500", marginBottom: 4 },
  uploadSubtext: { fontSize: 14, color: "#888" },
  uploadedImage: { width: "100%", height: 200, resizeMode: "cover" },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: "600", color: "#333", marginBottom: 8 },
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
  locationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  locationButton: { flexDirection: "row", alignItems: "center" },
  locationButtonText: { color: "#4285f4", fontWeight: "600" },
  coordinatesText: { marginTop: 4, fontSize: 12, color: "#666" },
  dropdown: {
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    paddingHorizontal: 12,
  },
  dropdownContainer: { borderRadius: 8, borderWidth: 1, borderColor: "#ddd" },
  placeholderStyle: { fontSize: 14, color: "#999" },
  selectedTextStyle: { fontSize: 14, color: "#333" },
  iconStyle: { width: 20, height: 20 },
  inputSearchStyle: { height: 40, fontSize: 14, borderRadius: 8 },
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
  selectedTypeText: { fontSize: 13, color: "#1976d2", fontWeight: "500" },
  removeTypeText: { fontSize: 16, color: "#1976d2", fontWeight: "600" },
  anonymousContainer: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
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
  checkboxChecked: { width: 12, height: 12, borderRadius: 2, backgroundColor: "#5cb85c" },
  anonymousText: { fontSize: 14, color: "#333" },
  submitButton: {
    backgroundColor: "#ccc",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
  },
  submitButtonActive: { backgroundColor: "#4285f4" },
  submitButtonText: { color: "#666", fontSize: 16, fontWeight: "600" },
  submitButtonTextActive: { color: "#fff" },
  listView: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ddd",
    marginTop: 4,
    maxHeight: 200,
  },
});

export default IssueUploadScreen;

