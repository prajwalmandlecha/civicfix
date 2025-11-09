import { useState } from "react";
import { Alert } from "react-native"; // still used for errors
import { showError, showInfo } from "../utils/notify";
import { auth } from "../services/firebase";
import api from "../services/api";

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
      showError("Please select an image");
      return { success: false, error: "No image" };
    }
    if (!description.trim()) {
      showError("Please provide a description");
      return { success: false, error: "No description" };
    }
    if (!address.trim()) {
      showError("Please provide a location");
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
        showError("You must be logged in to submit an issue");
        return { success: false, error: "Not authenticated" };
      }
      const token = await user.getIdToken();

      setUploadProgress(50);

      const response = await api.post("/submit-issue", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000,
      });

      setUploadProgress(100);

      if (response.data.no_issues_found) {
        showInfo("No issues were detected in the uploaded image.");
        return { success: true, noIssuesFound: true, data: response.data };
      }

      return { success: true, data: response.data };
    } catch (error) {
      console.error("Upload error:", error);
      const errorMessage =
        error.response?.data?.detail ||
        "Failed to upload issue. Please check your connection and try again.";
      showError(errorMessage, "Upload Failed");
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
      showError("Please select at least one image");
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

      const response = await api.post(`/api/issues/${issueId}/submit-fix`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 60000,
      });

      setUploadProgress(100);

      return { success: true, data: response.data };
    } catch (error) {
      console.error("Fix upload error:", error);
      const errorMessage =
        error.response?.data?.detail || "Failed to upload fix. Please try again.";
      showError(errorMessage, "Upload Failed");
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

