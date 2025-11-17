import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { auth } from "../services/firebase";
import api from "../services/api";
import { getIssueDisplayName } from "../utils/issueTypeMapping";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { showSuccess, showInfo, showError } from "../utils/notify";
import UploadProgressModal from "../components/UploadProgressModal";
import FixResultModal from "../components/FixResultModal";

const FixUploadScreen = ({ route, navigation }) => {
  const { issueId, issueData } = route.params || {};
  const [images, setImages] = useState([]);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showResultModal, setShowResultModal] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);

  const pickImages = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera roll permissions in your device settings to upload images."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaType: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: 5,
      });

      if (!result.canceled && result.assets) {
        const newImages = result.assets.map((asset) => ({
          uri: asset.uri,
          type: "image/jpeg",
          name: `fix_${Date.now()}_${Math.random()
            .toString(36)
            .substring(7)}.jpg`,
        }));
        setImages([...images, ...newImages].slice(0, 5)); // Max 5 images
      }
    } catch (error) {
      console.error("Error picking images:", error);
      Alert.alert(
        "Error",
        "Failed to access camera roll. Please check your permissions and try again."
      );
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera permissions in your device settings to take photos."
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        allowsEditing: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newImage = {
          uri: result.assets[0].uri,
          type: "image/jpeg",
          name: `fix_${Date.now()}_${Math.random()
            .toString(36)
            .substring(7)}.jpg`,
        };
        setImages([...images, newImage].slice(0, 5)); // Max 5 images
      }
    } catch (error) {
      console.error("Error taking photo:", error);
      Alert.alert(
        "Error",
        "Failed to access camera. Please check your permissions and try again."
      );
    }
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const uploadSteps = [
    "Preparing upload...",
    "Uploading images...",
    "Verifying fix...",
    "Finalizing...",
  ];

  const handleSubmit = async () => {
    if (!auth.currentUser) {
      Alert.alert(
        "Authentication Required",
        "You are not signed in. Please restart the app and log in."
      );
      return;
    }

    if (images.length === 0) {
      Alert.alert(
        "Missing Images",
        "Please add at least one photo showing the completed fix work."
      );
      return;
    }

    if (!issueId) {
      Alert.alert(
        "Error",
        "Issue ID is missing. Please go back and try selecting the issue again."
      );
      return;
    }

    setUploading(true);

    try {
      const token = await auth.currentUser.getIdToken();

      // Step 0: Preparing
      setCurrentStep(0);
      await new Promise(resolve => setTimeout(resolve, 500));

      const formData = new FormData();
      formData.append("description", description || "");

      // Backend now expects multiple files with key "files"
      images.forEach((image, index) => {
        formData.append("files", {
          uri: image.uri,
          type: image.type,
          name: image.name,
        });
      });

      // Step 1: Uploading
      setCurrentStep(1);
      await new Promise(resolve => setTimeout(resolve, 500));

      const response = await api.post(
        `/api/issues/${issueId}/submit-fix`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
        }
      );

      // Step 2: Verifying
      setCurrentStep(2);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 3: Finalizing
      setCurrentStep(3);
      await new Promise(resolve => setTimeout(resolve, 500));

      if (response.status === 200) {
        // Stop progress UI before showing result modal
        setUploading(false);
        setCurrentStep(0);
        // Show result modal
        setUploadResult(response.data);
        setShowResultModal(true);
      } else {
        // Non-200 response, ensure progress stops
        setUploading(false);
        setCurrentStep(0);
      }
    } catch (error) {
      console.error("Error submitting fix:", error.message || error);
      let errorMessage =
        "Failed to submit fix. Please check your connection and try again.";

      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }

      showError(errorMessage, "Submission Failed");
      setUploading(false);
      setCurrentStep(0);
    }
  };

  const handleCloseResultModal = () => {
    setShowResultModal(false);
    setUploadResult(null);
    setImages([]);
    setDescription("");
    setUploading(false);
    setCurrentStep(0);
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
        {/* Issue Info Card */}
        {issueData && (
          <View style={styles.issueCard}>
            <View style={styles.issueCardHeader}>
              <MaterialIcons name="info-outline" size={20} color="#4285f4" />
              <Text style={styles.issueCardTitle}>Fixing Issue</Text>
            </View>
            {issueData.postImage && (
              <Image
                source={issueData.postImage}
                style={styles.issueImage}
                resizeMode="cover"
              />
            )}
            <View style={styles.issueInfo}>
              <View style={styles.issueLocationRow}>
                <Ionicons name="location" size={16} color="#666" />
                <Text style={styles.issueLocation}>{issueData.location}</Text>
              </View>
              {issueData.issueTypes && issueData.issueTypes.length > 0 && (
                <View style={styles.issueTypesRow}>
                  {issueData.issueTypes.slice(0, 3).map((t, idx) => (
                    <View key={idx} style={styles.issueTypeChip}>
                      <Text style={styles.issueTypeText}>
                        {getIssueDisplayName(t.type)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        )}

        {/* Upload Images Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Upload Fix Photos</Text>
          <Text style={styles.sectionSubtitle}>
            Add photos showing the completed work (up to 5 images)
          </Text>

          <View style={styles.imageUploadContainer}>
            {images.length === 0 ? (
              // Empty state
              <View style={styles.uploadPlaceholder}>
                <MaterialIcons
                  name="add-photo-alternate"
                  size={48}
                  color="#ccc"
                  style={{ marginBottom: 16 }}
                />
                <Text style={styles.uploadPlaceholderText}>
                  Add photos of the completed fix
                </Text>

                <View style={styles.uploadButtonsRow}>
                  <TouchableOpacity
                    onPress={takePhoto}
                    style={styles.uploadButton}
                  >
                    <MaterialIcons name="photo-camera" size={24} color="#4CAF79" />
                    <Text style={styles.uploadButtonText}>Camera</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={pickImages}
                    style={styles.uploadButton}
                  >
                    <MaterialIcons name="photo-library" size={24} color="#4CAF79" />
                    <Text style={styles.uploadButtonText}>Gallery</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              // Images grid
              <View style={styles.imagesGrid}>
                {images.map((image, index) => (
                  <View key={index} style={styles.imagePreviewContainer}>
                    <Image source={{ uri: image.uri }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => removeImage(index)}
                    >
                      <MaterialIcons name="close" size={18} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.imageNumberBadge}>
                      <Text style={styles.imageNumberText}>{index + 1}</Text>
                    </View>
                  </View>
                ))}

                {/* Add More Button */}
                {images.length < 5 && (
                  <TouchableOpacity
                    style={styles.addMoreButton}
                    onPress={pickImages}
                  >
                    <MaterialIcons name="add" size={32} color="#4CAF79" />
                    <Text style={styles.addMoreText}>Add More</Text>
                    <Text style={styles.addMoreSubtext}>
                      {5 - images.length} left
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        </View>

        {/* Description Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description (Optional)</Text>
          <Text style={styles.sectionSubtitle}>
            Add details about the fix you completed
          </Text>
          <TextInput
            style={styles.textArea}
            placeholder="E.g., Filled the pothole with asphalt, replaced broken streetlight bulb..."
            placeholderTextColor="#999"
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            images.length > 0 && !uploading && styles.submitButtonActive,
          ]}
          onPress={handleSubmit}
          disabled={uploading || images.length === 0}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <MaterialIcons
                name="check-circle"
                size={20}
                color={images.length > 0 ? "#fff" : "#999"}
              />
              <Text
                style={[
                  styles.submitButtonText,
                  images.length > 0 && styles.submitButtonTextActive,
                ]}
              >
                Submit Fix ({images.length} {images.length === 1 ? "photo" : "photos"})
              </Text>
            </>
          )}
        </TouchableOpacity>

        <View style={styles.bottomPadding} />
      </KeyboardAwareScrollView>

      {/* Progress Modal */}
      <UploadProgressModal
        visible={uploading}
        steps={uploadSteps}
        currentStep={currentStep}
      />

      {/* Result Modal */}
      <FixResultModal
        visible={showResultModal}
        onClose={handleCloseResultModal}
        result={uploadResult}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },

  // Issue Info Card
  issueCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  issueCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  issueCardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginLeft: 8,
  },
  issueImage: {
    width: "100%",
    height: 180,
    borderRadius: 8,
    marginBottom: 12,
  },
  issueInfo: {
    gap: 8,
  },
  issueLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  issueLocation: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  issueTypesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  issueTypeChip: {
    backgroundColor: "#e3f2fd",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  issueTypeText: {
    fontSize: 12,
    color: "#1976d2",
    fontWeight: "500",
  },

  // Section Container
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },

  // Image Upload Container
  imageUploadContainer: {
    width: "100%",
  },
  uploadPlaceholder: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    padding: 32,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e1e5e9",
    borderStyle: "dashed",
  },
  uploadPlaceholderText: {
    fontSize: 16,
    color: "#999",
    marginBottom: 20,
    textAlign: "center",
  },
  uploadButtonsRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    justifyContent: "center",
  },
  uploadButton: {
    backgroundColor: "#fff",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#4CAF79",
    minWidth: 120,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  uploadButtonText: {
    fontSize: 14,
    color: "#4CAF79",
    fontWeight: "600",
  },

  // Images Grid
  imagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  imagePreviewContainer: {
    width: "48%",
    aspectRatio: 1,
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f8f9fa",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(220, 53, 69, 0.95)",
    borderRadius: 12,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  imageNumberBadge: {
    position: "absolute",
    bottom: 8,
    left: 8,
    backgroundColor: "rgba(66, 133, 244, 0.9)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  imageNumberText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },

  // Add More Button
  addMoreButton: {
    width: "48%",
    aspectRatio: 1,
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#4CAF79",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  addMoreText: {
    fontSize: 14,
    color: "#4CAF79",
    fontWeight: "600",
    marginTop: 4,
  },
  addMoreSubtext: {
    fontSize: 12,
    color: "#999",
  },

  // Text Input
  textArea: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: "#333",
    borderWidth: 1,
    borderColor: "#e1e5e9",
    minHeight: 100,
  },

  // Submit Button
  submitButton: {
    backgroundColor: "#ccc",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonActive: {
    backgroundColor: "#4CAF79",
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
  },
  submitButtonTextActive: {
    color: "#fff",
  },

  // Bottom Padding
  bottomPadding: {
    height: 40,
  },
});

export default FixUploadScreen;
