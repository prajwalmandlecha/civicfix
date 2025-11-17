import { useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from "react-native";
import Constants from "expo-constants";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import GooglePlacesTextInput from "react-native-google-places-textinput";
import { Dropdown } from "react-native-element-dropdown";
import { MaterialIcons } from "@expo/vector-icons";
import { getIssueTypesWithNames } from "../utils/issueTypeMapping";
import { useImagePicker } from "../hooks/useImagePicker";
import { useLocation } from "../hooks/useLocation";
import { useUpload } from "../hooks/useUpload";
import { showSuccess, showInfo } from "../utils/notify";
import UploadProgressModal from "../components/UploadProgressModal";
import IssueResultModal from "../components/IssueResultModal";

const IssueUploadScreen = ({ navigation }) => {
  const [description, setDescription] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [issueTypes, setIssueTypes] = useState([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  // Use custom hooks
  const { image, setImage, pickFromCamera, pickFromLibrary } = useImagePicker();
  const {
    location,
    address,
    setLocation,
    setAddress,
    loading: loadingLocation,
    getCurrentLocation,
  } = useLocation();
  const { uploading, uploadIssue } = useUpload();

  const issueTypesData = getIssueTypesWithNames();
  const dropdownData = Object.entries(issueTypesData).map(([key, value]) => ({
    label: value,
    value: key,
  }));

  const gmapskey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!gmapskey) {
    console.warn(
      "Google Maps API key is missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in app/.env or configure android.config.googleMaps.apiKey in app.json."
    );
  }

  const handleGetLocation = async () => {
    const result = await getCurrentLocation();
    if (result) {
      setLocation(result.location);
      setAddress(result.address);
    }
  };

  const uploadSteps = [
    "Preparing upload...",
    "Uploading image...",
    "Identifying issues...",
    "Finalizing...",
  ];

  const handleSubmit = async () => {
    const result = await uploadIssue({
      image,
      description,
      // Pass flat coords as expected by useUpload
      location: location?.coords
        ? { latitude: location.coords.latitude, longitude: location.coords.longitude }
        : null,
      issueTypes,
      isAnonymous,
      onStepChange: setCurrentStep,
    });

    if (result.success) {
      if (result.noIssuesFound) {
        showInfo("No issues were detected in the uploaded image.");
        // Reset form and navigate back
        setImage(null);
        setDescription("");
        setAddress("");
        setLocation(null);
        setIssueTypes([]);
        setIsAnonymous(false);
        navigation.goBack();
      } else {
        // Show result modal with identified issues
        setUploadResult(result.data);
        setShowResultModal(true);
      }
    }
  };

  const handleCloseResultModal = () => {
    setShowResultModal(false);
    setUploadResult(null);
    // Reset form and navigate back
    setImage(null);
    setDescription("");
    setAddress("");
    setLocation(null);
    setIssueTypes([]);
    setIsAnonymous(false);
    navigation.goBack();
  };

  return (
    <>
      <KeyboardAwareScrollView
        style={styles.container}
        bottomOffset={250}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formContainer}>
          {/* Image Upload Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upload Photo</Text>
            <Text style={styles.sectionSubtitle}>
              Add a clear photo showing the issue
            </Text>

            <View style={styles.imageUploadContainer}>
              {image ? (
                <View style={styles.imagePreviewWrapper}>
                  <Image source={{ uri: image }} style={styles.uploadedImage} />
                  <TouchableOpacity
                    style={styles.removeImageButton}
                    onPress={() => setImage(null)}
                  >
                    <MaterialIcons name="close" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.uploadPlaceholder}>
                  <MaterialIcons
                    name="add-photo-alternate"
                    size={48}
                    color="#ccc"
                    style={{ marginBottom: 16 }}
                  />
                  <Text style={styles.uploadPlaceholderText}>
                    Add a photo of the issue
                  </Text>

                  <View style={styles.uploadButtonsRow}>
                    <TouchableOpacity
                      onPress={pickFromCamera}
                      style={styles.uploadButton}
                      accessibilityLabel="Take photo"
                      accessibilityRole="button"
                    >
                      <MaterialIcons name="photo-camera" size={24} color="#4285f4" />
                      <Text style={styles.uploadButtonText}>Camera</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={pickFromLibrary}
                      style={styles.uploadButton}
                      accessibilityLabel="Upload photo from library"
                      accessibilityRole="button"
                    >
                      <MaterialIcons name="photo-library" size={24} color="#4285f4" />
                      <Text style={styles.uploadButtonText}>Gallery</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Description Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <Text style={styles.sectionSubtitle}>
              Describe what you see and why it's an issue
            </Text>
            <TextInput
              style={styles.textArea}
              placeholder="E.g., Large pothole on main road causing traffic issues..."
              placeholderTextColor="#999"
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Location Section */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Location</Text>
                <Text style={styles.sectionSubtitle}>
                  Where is this issue located?
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleGetLocation}
                disabled={loadingLocation}
                style={styles.locationButton}
              >
                {loadingLocation ? (
                  <ActivityIndicator size="small" color="#4285f4" />
                ) : (
                  <>
                    <MaterialIcons name="my-location" size={16} color="#4285f4" />
                    <Text style={styles.locationButtonText}>Use Current</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <GooglePlacesTextInput
              apiKey={gmapskey}
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
              <View style={styles.coordinatesChip}>
                <MaterialIcons name="location-on" size={14} color="#4285f4" />
                <Text style={styles.coordinatesText}>
                  {location?.coords?.latitude?.toFixed(4)}, {location?.coords?.longitude?.toFixed(4)}
                </Text>
              </View>
            )}
          </View>

          {/* Issue Types Section (Optional) */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Issue Types (Optional)</Text>
            <Text style={styles.sectionSubtitle}>
              Select categories - AI will suggest more
            </Text>
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
              placeholder="Select issue types"
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

          {/* Options Section */}
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => setIsAnonymous(!isAnonymous)}
              activeOpacity={0.7}
            >
              <View style={styles.optionLeft}>
                <MaterialIcons
                  name="visibility-off"
                  size={20}
                  color="#666"
                  style={{ marginRight: 12 }}
                />
                <View>
                  <Text style={styles.optionTitle}>Post Anonymously</Text>
                  <Text style={styles.optionSubtitle}>
                    Hide your name from this report
                  </Text>
                </View>
              </View>
              <View style={[styles.checkbox, isAnonymous && styles.checkboxActive]}>
                {isAnonymous && (
                  <MaterialIcons name="check" size={16} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[
              styles.submitButton,
              image && description && location?.coords && !uploading && styles.submitButtonActive,
            ]}
            onPress={handleSubmit}
            disabled={uploading || !image || !description || !location?.coords}
          >
            {uploading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <MaterialIcons
                  name="send"
                  size={20}
                  color={image && description && location?.coords ? "#fff" : "#999"}
                />
                <Text
                  style={[
                    styles.submitButtonText,
                    image && description && location?.coords && styles.submitButtonTextActive,
                  ]}
                >
                  Submit Issue Report
                </Text>
              </>
            )}
          </TouchableOpacity>

          <View style={styles.bottomPadding} />
        </View>
      </KeyboardAwareScrollView>

      {/* Progress Modal */}
      <UploadProgressModal
        visible={uploading}
        steps={uploadSteps}
        currentStep={currentStep}
      />

      {/* Result Modal */}
      <IssueResultModal
        visible={showResultModal}
        onClose={handleCloseResultModal}
        result={uploadResult?.analysis}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  formContainer: { paddingBottom: 16 },

  // Section styles
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 12,
  },

  // Image upload styles
  imageUploadContainer: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#e1e5e9",
    overflow: "hidden",
    minHeight: 240,
  },
  imagePreviewWrapper: {
    position: "relative",
    width: "100%",
    height: 240,
  },
  uploadedImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  removeImageButton: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: "#dc3545",
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  uploadPlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  uploadPlaceholderText: {
    fontSize: 14,
    color: "#999",
    marginBottom: 24,
    textAlign: "center",
  },
  uploadButtonsRow: {
    flexDirection: "row",
    gap: 16,
  },
  uploadButton: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#4285f4",
    borderStyle: "dashed",
    backgroundColor: "#f0f7ff",
    minWidth: 100,
  },
  uploadButtonText: {
    fontSize: 13,
    color: "#4285f4",
    fontWeight: "600",
    marginTop: 8,
  },

  // Input styles
  textInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    padding: 12,
    fontSize: 14,
    color: "#333",
  },
  textArea: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    padding: 12,
    fontSize: 14,
    color: "#333",
    minHeight: 100,
  },

  // Location styles
  locationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: "#f0f7ff",
  },
  locationButtonText: {
    color: "#4285f4",
    fontWeight: "600",
    fontSize: 13,
  },
  coordinatesChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: "#f0f7ff",
    borderRadius: 6,
    alignSelf: "flex-start",
    marginTop: 8,
  },
  coordinatesText: {
    fontSize: 12,
    color: "#4285f4",
    fontWeight: "500",
  },
  listView: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    marginTop: 4,
    maxHeight: 200,
  },

  // Dropdown styles
  dropdown: {
    height: 50,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    paddingHorizontal: 12,
  },
  dropdownContainer: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e1e5e9",
  },
  placeholderStyle: { fontSize: 14, color: "#999" },
  selectedTextStyle: { fontSize: 14, color: "#333" },
  iconStyle: { width: 20, height: 20 },
  inputSearchStyle: { height: 40, fontSize: 14, borderRadius: 8 },
  selectedTypesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 12,
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

  // Options styles
  optionRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e1e5e9",
  },
  optionLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  optionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  optionSubtitle: {
    fontSize: 12,
    color: "#666",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#e1e5e9",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  checkboxActive: {
    backgroundColor: "#4285f4",
    borderColor: "#4285f4",
  },

  // Submit button styles
  submitButton: {
    backgroundColor: "#ccc",
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonActive: {
    backgroundColor: "#4285f4",
  },
  submitButtonText: {
    color: "#999",
    fontSize: 16,
    fontWeight: "700",
  },
  submitButtonTextActive: {
    color: "#fff",
  },
  bottomPadding: {
    height: 40,
  },
});

export default IssueUploadScreen;
