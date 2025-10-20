import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { getIssueDisplayName } from "../utils/issueTypeMapping";

const SocialPost = ({
  postId,
  issueTypes,
  location,
  postImage,
  impactLevel,
  co2Impact,
  likes,
  status,
  onLike,
  onFixToggle,
  onSameIssue,
  onPress,
  detailedData,
}) => {
  const [isLiked, setIsLiked] = useState(false);
  const [scaleValue] = useState(new Animated.Value(1));
  const [isReported, setIsReported] = useState(false);
  console.log("Issue Types in SocialPost:", issueTypes);

  const handleLike = () => {
    // Toggle liked state
    setIsLiked(!isLiked);

    // Animate heart scale
    Animated.sequence([
      Animated.timing(scaleValue, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleValue, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start();

    // Call parent handler
    onLike();
  };

  const getImpactColor = () => {
    if (impactLevel === "High") return "#ffebee"; // Light red
    if (impactLevel === "Medium") return "#fff3e0"; // Light orange
    return "#e8f5e9"; // Light green for Low
  };

  const getTagColor = () => {
    // if (issueType === "Pothole") return "#FFF9E6";
    // if (issueType === "Streetlight") return "#FFF9E6";
    // if (issueType === "Garbage") return "#FFF9E6";
    return "#FFF9E6";
  };

  const handleReport = () => {
    setIsReported(!isReported);
  };

  return (
    <TouchableOpacity
      style={[styles.container, { backgroundColor: getImpactColor() }]}
      onPress={onPress}
      activeOpacity={0.95}
    >
      {/* Post Image Container */}
      <View style={styles.imageContainer}>
        <Image source={postImage} style={styles.postImage} />

        {/* Issue Type Tags Row */}
        <View style={styles.issueTagsContainer}>
          {issueTypes &&
            issueTypes.slice(0, 3).map((type, index) => (
              <View
                key={index}
                style={[styles.issueTag, { backgroundColor: getTagColor() }]}
              >
                <Text style={styles.issueTagText}>
                  {getIssueDisplayName(type.type)}
                </Text>
              </View>
            ))}
        </View>

        {/* Impact Level Badge */}
        <View style={styles.impactBadge}>
          <Text style={styles.impactBadgeText}>{impactLevel} Impact</Text>
        </View>
      </View>

      {/* Content Section */}
      <View style={styles.content}>
        {/* Location */}
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText}>{location}</Text>
        </View>

        {/* Actions Row */}
        <View style={styles.actionsRow}>
          {/* Likes */}
          <View style={styles.likesContainer}>
            <TouchableOpacity
              onPress={handleLike}
              style={styles.likeButton}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Animated.View
                style={{
                  transform: [{ scale: scaleValue }],
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                
                {isLiked ? (
                  <FontAwesome name="thumbs-up" size={24} color="#0d6efd" />
                ) : (
                  <FontAwesome name="thumbs-o-up" size={24
                    
                  } color="#6c757d" />
                )}
              </Animated.View>
            </TouchableOpacity>
            <Text style={styles.likesCount}>{likes}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.reportButton,
              isReported && styles.reportButtonReported,
            ]}
            onPress={handleReport}
          >
            <Ionicons
              name={isReported ? "flag" : "flag-outline"}
              size={16}
              color={isReported ? "#fff" : "#dc3545"}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.reportButtonText,
                isReported && styles.reportButtonTextReported,
              ]}
            >
              {isReported ? "Reported" : "Report"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Status Button */}
        {/* <TouchableOpacity
            style={[
              styles.statusButton,
              status === "resolved" && styles.statusButtonResolved,
            ]}
            onPress={onFixToggle}
          >
            <Text
              style={[
                styles.statusButtonText,
                status === "resolved" && styles.statusButtonTextResolved,
              ]}
            >
              {status === "resolved" ? "✓ Fixed" : "I fixed it"}
            </Text>
          </TouchableOpacity>
        </View> */}

        {/* Same Issue Link
        <TouchableOpacity onPress={onSameIssue} style={styles.sameIssueButton}>
          <Text style={styles.linkIcon}>🔗</Text>
          <Text style={styles.sameIssueText}>Same issue elsewhere?</Text>
        </TouchableOpacity> */}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
    borderRadius: 15,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: 250,
  },
  postImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  issueTagsContainer: {
    position: "absolute",
    top: 15,
    left: 15,
    right: 15,
    flexDirection: "row",
    flexWrap: "wrap",
    zIndex: 1,
    gap: 8,
  },
  issueTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  issueTagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#856404",
  },
  impactBadge: {
    position: "absolute",
    bottom: 10,
    right: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    zIndex: 2,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  impactBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#333",
  },
  content: {
    padding: 16,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  locationIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  locationText: {
    fontSize: 14,
    color: "#666",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  likesContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  likeButton: {
    marginRight: 8,
    padding: 4,
  },
  heartIcon: {
    fontSize: 24,
  },
  likesCount: {
    fontSize: 16,
    fontWeight: "500",
    color: "#333",
  },
  // statusButton: {
  //   paddingHorizontal: 20,
  //   paddingVertical: 10,
  //   borderRadius: 20,
  //   borderWidth: 1.5,
  //   borderColor: "#28a745",
  //   backgroundColor: "#fff",
  // },
  // statusButtonResolved: {
  //   backgroundColor: "#d4edda",
  //   borderColor: "#28a745",
  // },
  // statusButtonText: {
  //   fontSize: 14,
  //   fontWeight: "600",
  //   color: "#28a745",
  // },
  // statusButtonTextResolved: {
  //   color: "#155724",
  // },
  reportButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#dc3545",
    backgroundColor: "#fff",
  },
  reportButtonReported: {
    backgroundColor: "#dc3545",
    borderColor: "#c82333",
  },
  reportButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#dc3545",
  },
  reportButtonTextReported: {
    color: "#fff",
  },
  sameIssueButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
  },
  linkIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  sameIssueText: {
    fontSize: 13,
    color: "#17a2b8",
    textDecorationLine: "underline",
  },
});

export default SocialPost;
