import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

/**
 * Custom hook for handling image picking from camera or library
 * @returns {Object} Image picker utilities
 */
export const useImagePicker = () => {
  const [image, setImage] = useState(null);

  /**
   * Pick image from camera
   */
  const pickFromCamera = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera permissions in your device settings."
        );
        return null;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaType: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setImage(result.assets[0].uri);
        return result.assets[0].uri;
      }
      return null;
    } catch (error) {
      console.error("Camera error:", error);
      Alert.alert("Error", "Failed to access camera");
      return null;
    }
  };

  /**
   * Pick image from library
   */
  const pickFromLibrary = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera roll permissions in your device settings."
        );
        return null;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        setImage(result.assets[0].uri);
        return result.assets[0].uri;
      }
      return null;
    } catch (error) {
      console.error("Library error:", error);
      Alert.alert("Error", "Failed to access photo library");
      return null;
    }
  };

  /**
   * Pick multiple images from library
   * @param {number} maxImages - Maximum number of images to select
   */
  const pickMultipleFromLibrary = async (maxImages = 5) => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please grant camera roll permissions in your device settings to upload images."
        );
        return [];
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaType: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
        selectionLimit: maxImages,
      });

      if (!result.canceled && result.assets) {
        const imageUris = result.assets.map((asset) => ({
          uri: asset.uri,
          type: "image/jpeg",
          name: `image_${Date.now()}_${Math.random()
            .toString(36)
            .substring(7)}.jpg`,
        }));
        return imageUris;
      }
      return [];
    } catch (error) {
      console.error("Error picking multiple images:", error);
      Alert.alert("Error", "Failed to access camera roll");
      return [];
    }
  };

  /**
   * Reset image selection
   */
  const resetImage = () => {
    setImage(null);
  };

  return {
    image,
    setImage,
    pickFromCamera,
    pickFromLibrary,
    pickMultipleFromLibrary,
    resetImage,
  };
};
