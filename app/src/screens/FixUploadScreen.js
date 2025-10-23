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

const FixUploadScreen = ({ route, navigation }) => {
  const { issueId, issueData } = route.params || {};
  const [images, setImages] = useState([]);
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);

  const pickImages = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        alert("Please grant camera roll permissions to upload images.");
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
      alert("Failed to pick images. Please try again.");
    }
  };

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== "granted") {
        alert("Please grant camera permissions to take photos.");
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
      alert("Failed to take photo. Please try again.");
    }
  };

  const removeImage = (index) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!auth.currentUser) {
      alert("You are not signed in. Please restart the app and log in.");
      return;
    }

    if (images.length === 0) {
      alert("Please add at least one image of the fix.");
      return;
    }

    if (!issueId) {
      alert("Issue ID is missing. Please try again.");
      return;
    }

    setUploading(true);

    try {
      const token = await auth.currentUser.getIdToken();

      const formData = new FormData();
      formData.append("description", description || "");

      // Backend expects a single file with key "file"
      // Send only the first image
      formData.append("file", {
        uri: images[0].uri,
        type: images[0].type,
        name: images[0].name,
      });

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

      if (response.status === 200) {
        // Alert.alert(
        //   "Success",
        //   "Fix submitted successfully! Your contribution has been recorded.",
        //   [
        //     {
        //       text: "OK",
        //       onPress: () => {
        //         setImages([]);
        //         setDescription("");
        //         setUploading(false);
        //         navigation.goBack();
        //       },
        //     },
        //   ]
        // );
        alert(
          "Success",
          "Fix submitted successfully! Your contribution has been recorded."
        );
        navigation.goBack();
      }
    } catch (error) {
      console.error("Error submitting fix:", JSON.stringify(error, null, 2));
      const errorMessage =
        error.response?.data?.detail ||
        "Failed to submit fix. Please try again.";
      alert(errorMessage);
      setUploading(false);
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Issue Info */}
      {issueData && (
        <View style={styles.issueCard}>
          <Text style={styles.issueTitle}>Fixing Issue</Text>
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
              <Text style={styles.issueType}>
                {issueData.issueTypes
                  .map((t) => getIssueDisplayName(t.type))
                  .join(", ")}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Upload Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Upload Fix Images</Text>
        <Text style={styles.sectionSubtitle}>
          Add photos showing the completed fix (up to 5 images)
        </Text>

        {/* Images Grid */}
        <View style={styles.imagesGrid}>
          {images.map((image, index) => (
            <View key={index} style={styles.imagePreviewContainer}>
              <Image source={{ uri: image.uri }} style={styles.imagePreview} />
              <TouchableOpacity
                style={styles.removeImageButton}
                onPress={() => removeImage(index)}
              >
                <MaterialIcons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}

          {/* Add Image Buttons */}
          {images.length < 5 && (
            <>
              <TouchableOpacity
                style={styles.addImageButton}
                onPress={pickImages}
              >
                <MaterialIcons name="photo-library" size={32} color="#4285f4" />
                <Text style={styles.addImageText}>Gallery</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.addImageButton}
                onPress={takePhoto}
              >
                <MaterialIcons name="camera-alt" size={32} color="#4285f4" />
                <Text style={styles.addImageText}>Camera</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Description Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description (Optional)</Text>
        <Text style={styles.sectionSubtitle}>
          Add any notes about the fix you completed
        </Text>
        <TextInput
          style={styles.descriptionInput}
          placeholder="E.g., Filled the pothole with asphalt, repaired the streetlight..."
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
          (uploading || images.length === 0) && styles.submitButtonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={uploading || images.length === 0}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <MaterialIcons name="check-circle" size={24} color="#fff" />
            <Text style={styles.submitButtonText}>Submit Fix</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.bottomPadding} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  issueCard: {
    backgroundColor: "#fff",
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  issueTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 12,
  },
  issueImage: {
    width: "100%",
    height: 200,
    borderRadius: 8,
    marginBottom: 12,
  },
  issueInfo: {
    gap: 4,
  },
  issueLocation: {
    fontSize: 14,
    color: "#666",
  },
  issueType: {
    fontSize: 13,
    color: "#4285f4",
    fontWeight: "600",
  },
  section: {
    paddingHorizontal: 16,
    marginBottom: 24,
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
  imagesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  imagePreviewContainer: {
    position: "relative",
    width: 100,
    height: 100,
  },
  imagePreview: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  removeImageButton: {
    position: "absolute",
    top: -8,
    right: -8,
    backgroundColor: "#dc3545",
    borderRadius: 12,
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  addImageButton: {
    width: 100,
    height: 100,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#4285f4",
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f0f7ff",
  },
  addImageText: {
    fontSize: 12,
    color: "#4285f4",
    marginTop: 4,
    fontWeight: "600",
  },
  descriptionInput: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#333",
    borderWidth: 1,
    borderColor: "#e1e5e9",
    minHeight: 100,
  },
  submitButton: {
    backgroundColor: "#4CAF79",
    marginHorizontal: 16,
    paddingVertical: 16,
    borderRadius: 12,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  submitButtonDisabled: {
    backgroundColor: "#ccc",
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  bottomPadding: {
    height: 40,
  },
});

export default FixUploadScreen;
