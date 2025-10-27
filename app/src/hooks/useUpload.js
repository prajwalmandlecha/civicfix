import { useState } from "react";
import { Alert } from "react-native";
import { auth } from "../services/firebase";
import { submitIssue } from "../api/endpoints/issues.api";
import { submitFix } from "../api/endpoints/fixes.api";

/**
 * Custom hook for file upload operations
 * @returns {Object} Upload utilities
 */
export const useUpload = () => {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  /**
   * Upload an issue with image, location, and description
   */
  const uploadIssue = async ({
    image,
    description,
    address,
    issueTypes = [],
    isAnonymous = false,
  }) => {
    if (!image) {
      Alert.alert("Error", "Please select an image");
      return { success: false, error: "No image" };
    }
    if (!description.trim()) {
      Alert.alert("Error", "Please provide a description");
      return { success: false, error: "No description" };
    }
    if (!address.trim()) {
      Alert.alert("Error", "Please provide a location");
      return { success: false, error: "No location" };
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      const formData = new FormData();

      const ext = image.substring(image.lastIndexOf(".") + 1);
      const type = `image/${ext}`;

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

      // Get auth token
      const user = auth.currentUser;
      if (!user) {
        Alert.alert("Error", "You must be logged in to submit an issue");
        return { success: false, error: "Not authenticated" };
      }
      const token = await user.getIdToken();

      setUploadProgress(50);

      const response = await submitIssue(formData, token);

      setUploadProgress(100);

      if (response.data.no_issues_found) {
        Alert.alert("Notice", "No issues were detected in the uploaded image.");
        return { success: true, noIssuesFound: true, data: response.data };
      }

      return { success: true, data: response.data };
    } catch (error) {
      console.error("Upload error:", error);
      const errorMessage =
        error.response?.data?.detail ||
        "Failed to upload issue. Please check your connection and try again.";
      Alert.alert("Upload Failed", errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  /**
   * Upload a fix with images and description
   */
  const uploadFix = async ({ issueId, images, description, title }) => {
    if (!images || images.length === 0) {
      Alert.alert("Error", "Please select at least one image");
      return { success: false, error: "No images" };
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      const formData = new FormData();

      if (title) {
        formData.append("title", title);
      }
      if (description) {
        formData.append("description", description);
      }

      images.forEach((image) => {
        formData.append("files", {
          uri: image.uri,
          name: image.name,
          type: image.type,
        });
      });

      setUploadProgress(50);

      const response = await submitFix(issueId, formData);

      setUploadProgress(100);

      return { success: true, data: response.data };
    } catch (error) {
      console.error("Fix upload error:", error);
      const errorMessage =
        error.response?.data?.detail || "Failed to upload fix. Please try again.";
      Alert.alert("Upload Failed", errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  return {
    uploading,
    uploadProgress,
    uploadIssue,
    uploadFix,
  };
};

