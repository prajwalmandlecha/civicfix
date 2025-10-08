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

const { width } = Dimensions.get("window");

const SocialPost = ({
  postId,
  issueType,
  location,
  postImage,
  impactLevel,
  co2Impact,
  likes,
  status,
  onLike,
  onFixToggle,
  onSameIssue,
}) => {
  const [isLiked, setIsLiked] = useState(false);
  const [scaleValue] = useState(new Animated.Value(1));

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
    if (impactLevel === "High") return "#FFF3CD";
    if (impactLevel === "Medium") return "#FFF3CD";
    return "#FFF3CD";
  };

  const getTagColor = () => {
    if (issueType === "Pothole") return "#FFF9E6";
    if (issueType === "Streetlight") return "#FFF9E6";
    if (issueType === "Garbage") return "#FFF9E6";
    return "#FFF9E6";
  };

  return (
    <View style={styles.container}>
      {/* Post Image */}
      <Image source={postImage} style={styles.postImage} />

      {/* Issue Type Tag */}
      <View style={[styles.issueTag, { backgroundColor: getTagColor() }]}>
        <Text style={styles.issueTagText}>{issueType}</Text>
      </View>

      {/* Content Section */}
      <View style={styles.content}>
        {/* Location */}
        <View style={styles.locationRow}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText}>{location}</Text>
        </View>

        {/* Impact Warning */}
        <View
          style={[styles.impactWarning, { backgroundColor: getImpactColor() }]}
        >
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.impactText}>
            <Text style={styles.impactLevel}>{impactLevel}</Text> - {co2Impact}
          </Text>
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
              <Animated.Text
                style={[
                  styles.heartIcon,
                  { transform: [{ scale: scaleValue }] },
                ]}
              >
                {isLiked ? "❤️" : "🤍"}
              </Animated.Text>
            </TouchableOpacity>
            <Text style={styles.likesCount}>{likes}</Text>
          </View>

          {/* Status Button */}
          <TouchableOpacity
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
        </View>

        {/* Same Issue Link */}
        <TouchableOpacity onPress={onSameIssue} style={styles.sameIssueButton}>
          <Text style={styles.linkIcon}>🔗</Text>
          <Text style={styles.sameIssueText}>Same issue elsewhere?</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fff",
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
  postImage: {
    width: "100%",
    height: 250,
    resizeMode: "cover",
  },
  issueTag: {
    position: "absolute",
    top: 15,
    left: 15,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    zIndex: 1,
  },
  issueTagText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#856404",
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
  impactWarning: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: "#FFC107",
  },
  warningIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  impactText: {
    fontSize: 13,
    color: "#856404",
    flex: 1,
  },
  impactLevel: {
    fontWeight: "600",
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
  statusButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#28a745",
    backgroundColor: "#fff",
  },
  statusButtonResolved: {
    backgroundColor: "#d4edda",
    borderColor: "#28a745",
  },
  statusButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#28a745",
  },
  statusButtonTextResolved: {
    color: "#155724",
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
