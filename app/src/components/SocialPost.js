import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { getIssueDisplayName } from "../utils/issueTypeMapping";
import api from "../services/api";

const SocialPost = ({
  postId,
  issueTypes,
  location,
  postImage,
  impactLevel,
  co2Impact,
  likes,
  status,
  onPress,
  detailedData,
  description,
  createdAt,
  severityScore,
  distanceKm,
  userType,
  onUploadFix,
  onReport,
  onUpvote,
  userStatus, // NEW: Contains hasUpvoted and hasReported from backend
}) => {
  const [isReported, setIsReported] = useState(
    userStatus?.hasReported || false
  );
  const [isReporting, setIsReporting] = useState(false);
  const [isUpvoted, setIsUpvoted] = useState(userStatus?.hasUpvoted || false);
  const [isUpvoting, setIsUpvoting] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(likes || 0);

  const getImpactColor = () => {
    // For closed issues, show light blue background (different from low)
    if (status?.toLowerCase() === "closed") {
      return "#e3f2fd"; // Light blue - indicates resolved/fixed
    }
    // For open issues, use impact level colors
    if (impactLevel === "High") return "#ffebee"; // Light red
    if (impactLevel === "Medium") return "#fff3e0"; // Light orange
    return "#e8f5e9"; // Light green (low severity)
  };

  const getTagColor = () => {
    return "#FFF9E6";
  };

  // Sync state with userStatus prop (if provided)
  useEffect(() => {
    // Initialize upvote count from props
    if (likes !== undefined && likes !== null) {
      setUpvoteCount(likes);
    }
  }, [likes]);

  // Separate effect for userStatus to ensure it always updates
  useEffect(() => {
    if (userStatus) {
      const hasUpvoted = userStatus.hasUpvoted || false;
      const hasReported = userStatus.hasReported || false;

      console.log(`[SocialPost ${postId}] Updating status:`, {
        hasUpvoted,
        hasReported,
        userStatus,
      });

      setIsUpvoted(hasUpvoted);
      setIsReported(hasReported);
    }
  }, [postId, userStatus?.hasUpvoted, userStatus?.hasReported]);

  const handleUpvote = async () => {
    // Prevent multiple simultaneous clicks
    if (isUpvoting) {
      console.log("Already processing upvote, ignoring click");
      return;
    }

    setIsUpvoting(true);
    const previousUpvoted = isUpvoted;
    const previousCount = upvoteCount;

    // Optimistic update - toggle state
    const newUpvotedState = !isUpvoted;
    setIsUpvoted(newUpvotedState);
    setUpvoteCount(newUpvotedState ? upvoteCount + 1 : upvoteCount - 1);

    try {
      // Backend handles toggle - returns isActive state
      const response = await api.post(`/api/issues/${postId}/upvote`);

      // Sync with backend response
      if (response.data) {
        const backendIsActive =
          response.data.isActive || response.data.hasUpvoted || false;
        setIsUpvoted(backendIsActive);

        // Update count from backend - use correct count based on status
        if (response.data.upvotes) {
          const isClosed = status?.toLowerCase() === "closed";
          const newCount = isClosed
            ? response.data.upvotes.closed || 0
            : response.data.upvotes.open || 0;
          setUpvoteCount(newCount);
        }

        console.log(
          `Upvote ${backendIsActive ? "added" : "removed"} for issue ${postId}`
        );
      }

      // Call parent callback if provided
      if (onUpvote) {
        onUpvote(postId, { ok: true, isActive: response.data?.isActive });
      }
    } catch (error) {
      console.error("Error upvoting issue:", error);
      Alert.alert(
        "Error",
        error.response?.data?.detail ||
          "Failed to upvote. Please check your connection and try again."
      );

      // Revert optimistic update on error
      setIsUpvoted(previousUpvoted);
      setUpvoteCount(previousCount);
    } finally {
      // Add small delay before allowing next click to prevent rapid clicking
      setTimeout(() => {
        setIsUpvoting(false);
      }, 300);
    }
  };

  const handleReport = async () => {
    if (isReporting || isReported) return;

    // Different messages based on issue status
    const isClosed = status?.toLowerCase() === "closed";
    const title = isClosed ? "Report as Not Fixed" : "Report as Spam";
    const message = isClosed
      ? "Do you want to report this issue as not fixed? If enough citizens report this, the issue will be reopened for further action."
      : "Do you want to report this issue as spam? This action is permanent and helps maintain community quality.";
    const buttonText = isClosed ? "Not Fixed" : "Report";

    // Show confirmation dialog
    Alert.alert(title, message, [
      {
        text: "Cancel",
        style: "cancel",
      },
      {
        text: buttonText,
        style: "destructive",
        onPress: async () => {
          setIsReporting(true);
          try {
            // Backend creates permanent report (NOT toggleable)
            const response = await api.post(`/api/issues/${postId}/report`);

            // Sync with backend response
            if (response.data) {
              const hasReported =
                response.data.hasReported || response.data.isActive || true;
              setIsReported(hasReported);

              console.log(`Issue ${postId} reported successfully`);
            } else {
              // Fallback if no response data
              setIsReported(true);
            }

            // Call parent callback if provided
            if (onReport) {
              onReport(postId, { ok: true, hasReported: true });
            }

            const successMessage = isClosed
              ? "Thank you for your feedback! Your report has been recorded."
              : "Issue reported successfully. Thank you for helping maintain quality!";

            Alert.alert("Success", successMessage);
          } catch (error) {
            console.error("Error reporting issue:", error);

            // Check if already reported
            if (error.response?.data?.message === "Already reported") {
              setIsReported(true);
              Alert.alert(
                "Already Reported",
                "You have already reported this issue."
              );
            } else {
              Alert.alert(
                "Error",
                error.response?.data?.detail ||
                  "Failed to report issue. Please check your connection and try again."
              );
            }
          } finally {
            setIsReporting(false);
          }
        },
      },
    ]);
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

        {/* FIXED Overlay - Only for closed issues */}
        {status?.toLowerCase() === "closed" && (
          <View style={styles.fixedOverlay}>
            <View style={styles.fixedBadge}>
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.fixedText}>FIXED</Text>
            </View>
          </View>
        )}

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
        {/* Location and Distance */}
        <View style={styles.locationRow}>
          <Ionicons
            name="location"
            size={14}
            color="#666"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.locationText}>{location}</Text>
          {distanceKm !== undefined && (
            <Text style={styles.distanceText}>
              • {distanceKm.toFixed(1)} km
            </Text>
          )}
        </View>

        {/* Description */}
        {description && (
          <Text style={styles.descriptionText} numberOfLines={2}>
            {description}
          </Text>
        )}

        {/* Actions Row */}
        <View style={styles.actionsRow}>
          {/* For CLOSED issues - show Fixed/Not Fixed buttons (citizens only) */}
          {status?.toLowerCase() === "closed" && userType === "citizen" ? (
            <>
              {/* Fixed Button (maps to closed upvote) */}
              <TouchableOpacity
                style={[
                  styles.fixedButton,
                  isUpvoted && styles.fixedButtonActive,
                  isUpvoting && styles.fixedButtonDisabled,
                ]}
                onPress={handleUpvote}
                disabled={isUpvoting}
              >
                <Ionicons
                  name={
                    isUpvoted ? "checkmark-circle" : "checkmark-circle-outline"
                  }
                  size={16}
                  color={isUpvoted ? "#fff" : "#4CAF79"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.fixedButtonText,
                    isUpvoted && styles.fixedButtonTextActive,
                  ]}
                >
                  Fixed {upvoteCount > 0 ? `(${upvoteCount})` : ""}
                </Text>
              </TouchableOpacity>

              {/* Not Fixed Button (maps to closed report) */}
              <TouchableOpacity
                style={[
                  styles.notFixedButton,
                  isReported && styles.notFixedButtonActive,
                  isReporting && styles.notFixedButtonDisabled,
                ]}
                onPress={handleReport}
                disabled={isReporting || isReported}
              >
                <Ionicons
                  name={isReported ? "close-circle" : "close-circle-outline"}
                  size={16}
                  color={isReported ? "#fff" : "#dc3545"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.notFixedButtonText,
                    isReported && styles.notFixedButtonTextActive,
                  ]}
                >
                  {isReporting
                    ? "Submitting..."
                    : isReported
                    ? "Not Fixed"
                    : "Not Fixed"}
                </Text>
              </TouchableOpacity>
            </>
          ) : status?.toLowerCase() === "open" ? (
            /* For OPEN issues - show original upvote/report buttons */
            <>
              {/* Upvote Button - visible to all for open issues */}
              <TouchableOpacity
                style={[
                  styles.upvoteButton,
                  isUpvoted && styles.upvoteButtonActive,
                  isUpvoting && styles.upvoteButtonDisabled,
                ]}
                onPress={handleUpvote}
                disabled={isUpvoting}
              >
                <Ionicons
                  name={isUpvoted ? "heart" : "heart-outline"}
                  size={16}
                  color={isUpvoted ? "#fff" : "#4CAF79"}
                  style={{ marginRight: 6 }}
                />
                <Text
                  style={[
                    styles.upvoteButtonText,
                    isUpvoted && styles.upvoteButtonTextActive,
                  ]}
                >
                  {upvoteCount}
                </Text>
              </TouchableOpacity>

              {userType === "ngo" ? (
                <TouchableOpacity
                  style={styles.uploadFixButton}
                  onPress={onUploadFix}
                >
                  <Ionicons
                    name="construct"
                    size={16}
                    color="#fff"
                    style={{ marginRight: 6 }}
                  />
                  <Text style={styles.uploadFixButtonText}>Upload Fix</Text>
                </TouchableOpacity>
              ) : userType === "citizen" ? (
                // Report Button - ONLY for citizens on open issues
                <TouchableOpacity
                  style={[
                    styles.reportButton,
                    isReported && styles.reportButtonReported,
                    isReporting && styles.reportButtonDisabled,
                  ]}
                  onPress={handleReport}
                  disabled={isReporting || isReported}
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
                    {isReporting
                      ? "Reporting..."
                      : isReported
                      ? "Reported"
                      : "Report"}
                  </Text>
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </View>
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
  fixedOverlay: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 10,
  },
  fixedBadge: {
    backgroundColor: "rgba(76, 175, 80, 0.9)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  fixedText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  issueTagsContainer: {
    position: "absolute",
    top: 15,
    left: 15,
    right: 110, // Leave space for fixed overlay (was 15)
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
  locationText: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  distanceText: {
    fontSize: 13,
    color: "#999",
    marginLeft: 8,
    fontWeight: "500",
  },
  descriptionText: {
    fontSize: 14,
    color: "#444",
    lineHeight: 20,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 8,
  },
  upvoteButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#4CAF79",
    backgroundColor: "#fff",
  },
  upvoteButtonActive: {
    backgroundColor: "#4CAF79",
    borderColor: "#45a06d",
  },
  upvoteButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4CAF79",
  },
  upvoteButtonTextActive: {
    color: "#fff",
  },
  upvoteButtonDisabled: {
    opacity: 0.6,
  },
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
  reportButtonDisabled: {
    opacity: 0.6,
  },
  uploadFixButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#4CAF79",
  },
  uploadFixButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#fff",
  },
  // Fixed Button (for closed issues - maps to closed upvote)
  fixedButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#4CAF79",
    backgroundColor: "#fff",
    flex: 1,
    justifyContent: "center",
  },
  fixedButtonActive: {
    backgroundColor: "#4CAF79",
    borderColor: "#45a06d",
  },
  fixedButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4CAF79",
  },
  fixedButtonTextActive: {
    color: "#fff",
  },
  fixedButtonDisabled: {
    opacity: 0.6,
  },
  // Not Fixed Button (for closed issues - maps to closed report)
  notFixedButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#dc3545",
    backgroundColor: "#fff",
    flex: 1,
    justifyContent: "center",
  },
  notFixedButtonActive: {
    backgroundColor: "#dc3545",
    borderColor: "#c82333",
  },
  notFixedButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#dc3545",
  },
  notFixedButtonTextActive: {
    color: "#fff",
  },
  notFixedButtonDisabled: {
    opacity: 0.6,
  },
});

export default SocialPost;
