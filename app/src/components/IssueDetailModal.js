import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons, FontAwesome } from "@expo/vector-icons";
import { getIssueDisplayName } from "../utils/issueTypeMapping";
import api from "../services/api";

const { width } = Dimensions.get("window");

const IssueDetailModal = ({
  visible,
  onClose,
  issueData,
  userType,
  onUploadFix,
}) => {
  const [isLiked, setIsLiked] = useState(false);
  const [fixDetails, setFixDetails] = useState(null);
  const [loadingFix, setLoadingFix] = useState(false);
  const [currentFixImageIndex, setCurrentFixImageIndex] = useState(0);

  // State for upvote/report actions
  const [isUpvoted, setIsUpvoted] = useState(false);
  const [isReported, setIsReported] = useState(false);
  const [isUpvoting, setIsUpvoting] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(0);

  // Fetch fix details when modal opens for closed issues
  useEffect(() => {
    const fetchFixDetails = async () => {
      if (
        visible &&
        issueData?.status?.toLowerCase() === "closed" &&
        issueData?.detailedData?.issue_id
      ) {
        setLoadingFix(true);
        try {
          const response = await api.get(
            `/api/issues/${issueData.detailedData.issue_id}/fix-details`
          );
          if (response.data.has_fix) {
            setFixDetails(response.data);
          }
        } catch (error) {
          console.error("Error fetching fix details:", error);
        } finally {
          setLoadingFix(false);
        }
      }
    };

    fetchFixDetails();
  }, [visible, issueData]);

  // Reset fix details when modal closes
  useEffect(() => {
    if (!visible) {
      setFixDetails(null);
      setCurrentFixImageIndex(0);
    }
  }, [visible]);

  // Initialize upvote/report state from issueData
  useEffect(() => {
    if (visible && issueData) {
      const isClosed = issueData.status?.toLowerCase() === "closed";
      const count = isClosed
        ? issueData.detailedData?.upvotes?.closed || 0
        : issueData.detailedData?.upvotes?.open || 0;

      setUpvoteCount(count);
      setIsUpvoted(issueData.userStatus?.hasUpvoted || false);
      setIsReported(issueData.userStatus?.hasReported || false);
    }
  }, [visible, issueData]);

  // Upvote handler
  const handleUpvote = async () => {
    if (isUpvoting || !issueData?.id) return;

    setIsUpvoting(true);
    const previousUpvoted = isUpvoted;
    const previousCount = upvoteCount;

    // Optimistic update
    const newUpvotedState = !isUpvoted;
    setIsUpvoted(newUpvotedState);
    setUpvoteCount(newUpvotedState ? upvoteCount + 1 : upvoteCount - 1);

    try {
      const response = await api.post(`/api/issues/${issueData.id}/upvote`);

      if (response.data) {
        const backendIsActive =
          response.data.isActive || response.data.hasUpvoted || false;
        setIsUpvoted(backendIsActive);

        if (response.data.upvotes) {
          const isClosed = issueData.status?.toLowerCase() === "closed";
          const newCount = isClosed
            ? response.data.upvotes.closed || 0
            : response.data.upvotes.open || 0;
          setUpvoteCount(newCount);
        }
      }
    } catch (error) {
      console.error("Error upvoting issue:", error);
      // Revert on error
      setIsUpvoted(previousUpvoted);
      setUpvoteCount(previousCount);
    } finally {
      setTimeout(() => {
        setIsUpvoting(false);
      }, 300);
    }
  };

  // Report handler
  const handleReport = async () => {
    if (isReporting || isReported || !issueData?.id) return;

    const isClosed = issueData.status?.toLowerCase() === "closed";
    const title = isClosed ? "Report as Not Fixed" : "Report as Spam";
    const message = isClosed
      ? "Do you want to report this issue as not fixed? If enough citizens report this, the issue will be reopened for further action."
      : "Do you want to report this issue as spam? This action is permanent and helps maintain community quality.";
    const buttonText = isClosed ? "Not Fixed" : "Report";

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
            const response = await api.post(
              `/api/issues/${issueData.id}/report`
            );

            if (response.data) {
              const hasReported =
                response.data.hasReported || response.data.isActive || true;
              setIsReported(hasReported);
            } else {
              setIsReported(true);
            }

            const successMessage = isClosed
              ? "Thank you for your feedback! Your report has been recorded."
              : "Issue reported successfully. Thank you for helping maintain quality!";

            Alert.alert("Success", successMessage);
          } catch (error) {
            console.error("Error reporting issue:", error);

            if (error.response?.data?.message === "Already reported") {
              setIsReported(true);
              Alert.alert(
                "Already Reported",
                "You have already reported this issue."
              );
            } else {
              Alert.alert("Error", "Failed to report issue. Please try again.");
            }
          } finally {
            setIsReporting(false);
          }
        },
      },
    ]);
  };

  if (!issueData) return null;

  const getImpactColor = () => {
    // For closed issues, show light green background
    if (issueData.status?.toLowerCase() === "closed") {
      return "#e8f5e9"; // Light green
    }
    // For open issues, use impact level colors
    if (issueData.impactLevel === "High") return "#ffebee"; // Light red
    if (issueData.impactLevel === "Medium") return "#fff3e0"; // Light orange
    return "#e8f5e9"; // Light green
  };

  const getSeverityColor = (severity) => {
    if (severity === "high") return "#d32f2f";
    if (severity === "medium") return "#f57c00";
    return "#388e3c";
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View
          style={[styles.modalContent, { backgroundColor: getImpactColor() }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Issue Details</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Image */}
            {issueData.postImage && (
              <Image source={issueData.postImage} style={styles.image} />
            )}

            {/* Basic Info */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Location</Text>
              <View style={styles.locationRow}>
                <Ionicons
                  name="location"
                  size={16}
                  color="#666"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.locationText}>{issueData.location}</Text>
              </View>

              {/* Uploaded By */}
              {issueData.detailedData?.uploader_display_name && (
                <View style={styles.uploaderRow}>
                  <Ionicons
                    name="person"
                    size={16}
                    color="#666"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.uploaderText}>
                    Uploaded by:{" "}
                    <Text style={styles.uploaderName}>
                      {issueData.detailedData.uploader_display_name}
                    </Text>
                  </Text>
                </View>
              )}
            </View>

            {/* Status & Severity & CO2 */}
            <View style={styles.section}>
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Status</Text>
                  <Text style={styles.statValue}>{issueData.status}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Severity</Text>
                  <Text style={styles.statValue}>
                    {issueData.detailedData?.severity_score || "N/A"}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>
                    {issueData.status?.toLowerCase() === "closed"
                      ? "CO₂ Saved"
                      : "CO₂ Risk"}
                  </Text>
                  <Text
                    style={[
                      styles.statValue,
                      issueData.status?.toLowerCase() === "closed" &&
                        styles.co2SavedValue,
                    ]}
                  >
                    {issueData.status?.toLowerCase() === "closed"
                      ? fixDetails?.co2_saved
                        ? Math.round(fixDetails.co2_saved)
                        : issueData.detailedData?.fate_risk_co2
                        ? Math.round(issueData.detailedData.fate_risk_co2)
                        : 0
                      : issueData.detailedData?.fate_risk_co2
                      ? Math.round(issueData.detailedData.fate_risk_co2)
                      : 0}{" "}
                    kg
                  </Text>
                </View>
              </View>
            </View>

            {/* Fix Details - Only for Closed Issues - MOVED HERE ABOVE DESCRIPTION */}
            {issueData.status?.toLowerCase() === "closed" && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Fix Information</Text>
                {loadingFix ? (
                  <View style={styles.loadingFixContainer}>
                    <ActivityIndicator size="small" color="#4CAF79" />
                    <Text style={styles.loadingFixText}>
                      Loading fix details...
                    </Text>
                  </View>
                ) : fixDetails ? (
                  <View style={styles.fixDetailsContainer}>
                    {/* Fix Title */}
                    {fixDetails.title && (
                      <View style={styles.fixTitleSection}>
                        <View style={styles.fixTitleHeader}>
                          <Ionicons
                            name="checkmark-circle"
                            size={24}
                            color="#4CAF79"
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.fixTitle}>
                            {fixDetails.title}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Fix Images Gallery */}
                    {fixDetails.image_urls &&
                      fixDetails.image_urls.length > 0 && (
                        <View style={styles.fixImagesSection}>
                          <View style={styles.fixPhotosHeader}>
                            <Text style={styles.fixSubtitle}>Fix Photos</Text>
                            {fixDetails.image_urls.length > 1 && (
                              <View style={styles.photoCountBadge}>
                                <Ionicons
                                  name="images"
                                  size={14}
                                  color="#4CAF79"
                                  style={{ marginRight: 4 }}
                                />
                                <Text style={styles.photoCountText}>
                                  {fixDetails.image_urls.length} photos
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={styles.fixImageGallery}>
                            <Image
                              source={{
                                uri: fixDetails.image_urls[
                                  currentFixImageIndex
                                ],
                              }}
                              style={styles.fixMainImage}
                            />
                            {fixDetails.image_urls.length > 1 && (
                              <>
                                <View style={styles.fixImageNavigation}>
                                  <TouchableOpacity
                                    style={styles.fixImageNavButton}
                                    onPress={() =>
                                      setCurrentFixImageIndex((prev) =>
                                        prev > 0
                                          ? prev - 1
                                          : fixDetails.image_urls.length - 1
                                      )
                                    }
                                  >
                                    <Ionicons
                                      name="chevron-back"
                                      size={24}
                                      color="#fff"
                                    />
                                  </TouchableOpacity>
                                  <View style={styles.fixImageCounterContainer}>
                                    <Text style={styles.fixImageCounter}>
                                      {currentFixImageIndex + 1} /{" "}
                                      {fixDetails.image_urls.length}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    style={styles.fixImageNavButton}
                                    onPress={() =>
                                      setCurrentFixImageIndex((prev) =>
                                        prev < fixDetails.image_urls.length - 1
                                          ? prev + 1
                                          : 0
                                      )
                                    }
                                  >
                                    <Ionicons
                                      name="chevron-forward"
                                      size={24}
                                      color="#fff"
                                    />
                                  </TouchableOpacity>
                                </View>
                                {/* Pagination Dots */}
                                <View style={styles.paginationDots}>
                                  {fixDetails.image_urls.map((_, index) => (
                                    <View
                                      key={index}
                                      style={[
                                        styles.paginationDot,
                                        index === currentFixImageIndex &&
                                          styles.paginationDotActive,
                                      ]}
                                    />
                                  ))}
                                </View>
                              </>
                            )}
                          </View>
                        </View>
                      )}

                    {/* Fixed By Information */}
                    <View style={styles.fixedBySection}>
                      <Text style={styles.fixSubtitle}>Fixed By</Text>
                      <View style={styles.fixedByCard}>
                        <View style={styles.fixedByHeader}>
                          <Ionicons name="business" size={40} color="#4CAF79" />
                          <View style={styles.fixedByInfo}>
                            <Text style={styles.fixedByName}>
                              {fixDetails.fixed_by.name}
                            </Text>
                            <View style={styles.ngoBadge}>
                              <Ionicons
                                name="construct"
                                size={12}
                                color="#4CAF79"
                              />
                              <Text style={styles.ngoBadgeText}>NGO</Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Fix Description */}
                    {fixDetails.description && (
                      <View style={styles.fixDescriptionSection}>
                        <Text style={styles.fixSubtitle}>Fix Description</Text>
                        <View style={styles.fixDescriptionCard}>
                          <Text style={styles.fixDescriptionText}>
                            {fixDetails.description}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Fix Date */}
                    {fixDetails.created_at && (
                      <View style={styles.fixDateSection}>
                        <Ionicons name="calendar" size={14} color="#666" />
                        <Text style={styles.fixDateText}>
                          Fixed on{" "}
                          {new Date(fixDetails.created_at).toLocaleString()}
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.noFixDataText}>
                    Fix information not available
                  </Text>
                )}
              </View>
            )}

            {/* Description - Only show for OPEN issues */}
            {issueData.status?.toLowerCase() === "open" &&
              issueData.detailedData?.description && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Description</Text>
                  <Text style={styles.descriptionText}>
                    {issueData.detailedData.description}
                  </Text>
                </View>
              )}

            {/* For Closed Issues: Show Fix Outcome Details */}
            {issueData.status?.toLowerCase() === "closed" &&
            fixDetails?.fix_outcomes ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Fix Outcome</Text>

                {/* Overall Summary */}
                <View style={styles.outcomeOverallCard}>
                  <View style={styles.outcomeRow}>
                    <Text style={styles.outcomeLabel}>Overall Outcome:</Text>
                    <Text style={[styles.outcomeValue, styles.outcomeSuccess]}>
                      {fixDetails.overall_outcome === "closed"
                        ? "✓ Fully Resolved"
                        : "✗ Rejected"}
                    </Text>
                  </View>
                  <View style={styles.outcomeRow}>
                    <Text style={styles.outcomeLabel}>Success Rate:</Text>
                    <Text style={styles.outcomeValue}>
                      {((fixDetails.success_rate || 0) * 100).toFixed(0)}%
                    </Text>
                  </View>
                  {fixDetails.co2_saved > 0 && (
                    <View style={styles.outcomeRow}>
                      <Text style={styles.outcomeLabel}>CO₂ Saved:</Text>
                      <Text style={[styles.outcomeValue, styles.co2SavedText]}>
                        {Math.round(fixDetails.co2_saved)} kg
                      </Text>
                    </View>
                  )}
                </View>

                {/* Per-Issue Results */}
                <Text style={styles.perIssueTitle}>Per-Issue Results</Text>
                {fixDetails.fix_outcomes.map((outcome, index) => (
                  <View key={index} style={styles.perIssueCard}>
                    <View style={styles.perIssueHeader}>
                      <Text style={styles.perIssueType}>
                        {getIssueDisplayName(outcome.issue_type)}
                      </Text>
                      <View
                        style={[
                          styles.fixStatusBadge,
                          {
                            backgroundColor:
                              outcome.fixed === "yes" ? "#4CAF79" : "#FF6B6B",
                          },
                        ]}
                      >
                        <Text style={styles.fixStatusText}>
                          {outcome.fixed === "yes" ? "FIXED" : "NOT FIXED"}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.perIssueDetail}>
                      <Text style={styles.perIssueDetailLabel}>
                        Fix Confidence:
                      </Text>
                      <Text style={styles.perIssueDetailValue}>
                        {(outcome.confidence * 100).toFixed(0)}%
                      </Text>
                    </View>

                    {outcome.notes && (
                      <View style={styles.perIssueNotesSection}>
                        <Text style={styles.perIssueNotesLabel}>Notes:</Text>
                        <Text style={styles.perIssueNotesText}>
                          {outcome.notes}
                        </Text>
                      </View>
                    )}

                    {outcome.evidence_photos &&
                      outcome.evidence_photos.length > 0 && (
                        <View style={styles.evidencePhotosSection}>
                          <Text style={styles.evidencePhotosLabel}>
                            Evidence Photos:{" "}
                            {outcome.evidence_photos
                              .map((photoNum) => `Photo #${photoNum + 1}`)
                              .join(", ")}
                          </Text>
                        </View>
                      )}
                  </View>
                ))}
              </View>
            ) : (
              /* For Open Issues: Show Detected Issues */
              issueData.detailedData?.detected_issues && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Detected Issues</Text>
                  {issueData.detailedData.detected_issues.map(
                    (issue, index) => (
                      <View key={index} style={styles.detectedIssueCard}>
                        <View style={styles.issueHeader}>
                          <Text style={styles.issueType}>
                            {getIssueDisplayName(issue.type)}
                          </Text>
                          <View
                            style={[
                              styles.severityBadge,
                              {
                                backgroundColor: getSeverityColor(
                                  issue.severity
                                ),
                              },
                            ]}
                          >
                            <Text style={styles.severityText}>
                              {issue.severity.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.issueDetail}>
                          <Text style={styles.detailLabel}>
                            Severity Score:
                          </Text>
                          <Text style={styles.detailValue}>
                            {issue.severity_score}/10
                          </Text>
                        </View>

                        <View style={styles.issueTextSection}>
                          <Text style={styles.issueTextLabel}>
                            Future Impact:
                          </Text>
                          <Text style={styles.issueTextContent}>
                            {issue.future_impact}
                          </Text>
                        </View>

                        <View style={styles.issueTextSection}>
                          <Text style={styles.issueTextLabel}>
                            Predicted Fix:
                          </Text>
                          <Text style={styles.issueTextContent}>
                            {issue.predicted_fix}
                          </Text>
                        </View>
                      </View>
                    )
                  )}
                </View>
              )
            )}

            {/* Reported At */}
            {issueData.detailedData?.reported_at && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Reported</Text>
                <Text style={styles.dateText}>
                  {new Date(
                    issueData.detailedData.reported_at
                  ).toLocaleString()}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Action Buttons Footer */}
          <View style={styles.actionFooter}>
            {/* For CLOSED issues - show Fixed/Not Fixed buttons (citizens only) */}
            {issueData.status?.toLowerCase() === "closed" &&
            userType === "citizen" ? (
              <>
                {/* Fixed Button (maps to closed upvote) */}
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.fixedButton,
                    isUpvoted && styles.fixedButtonActive,
                  ]}
                  onPress={handleUpvote}
                  disabled={isUpvoting}
                >
                  <Ionicons
                    name={
                      isUpvoted
                        ? "checkmark-circle"
                        : "checkmark-circle-outline"
                    }
                    size={20}
                    color={isUpvoted ? "#fff" : "#4CAF79"}
                  />
                  <Text
                    style={[
                      styles.actionButtonText,
                      styles.fixedButtonText,
                      isUpvoted && styles.actionButtonTextActive,
                    ]}
                  >
                    Fixed {upvoteCount > 0 ? `(${upvoteCount})` : ""}
                  </Text>
                </TouchableOpacity>

                {/* Not Fixed Button (maps to closed report) */}
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    styles.notFixedButton,
                    isReported && styles.notFixedButtonActive,
                  ]}
                  onPress={handleReport}
                  disabled={isReporting || isReported}
                >
                  <Ionicons
                    name={isReported ? "close-circle" : "close-circle-outline"}
                    size={20}
                    color={isReported ? "#fff" : "#dc3545"}
                  />
                  <Text
                    style={[
                      styles.actionButtonText,
                      styles.notFixedButtonText,
                      isReported && styles.actionButtonTextActive,
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
            ) : /* For OPEN issues - show Upload Fix button for NGOs */ userType ===
                "ngo" && issueData.status?.toLowerCase() === "open" ? (
              <TouchableOpacity
                style={[styles.actionButton, styles.uploadFixButton]}
                onPress={() => {
                  onClose();
                  onUploadFix && onUploadFix(issueData);
                }}
              >
                <Ionicons name="construct" size={20} color="#fff" />
                <Text
                  style={[
                    styles.actionButtonText,
                    styles.actionButtonTextActive,
                  ]}
                >
                  Upload Fix
                </Text>
              </TouchableOpacity>
            ) : null}

            {/* Close Button - Always show */}
            <TouchableOpacity
              style={[
                styles.actionButton,
                styles.closeButtonStyle,
                // Make close button full width if it's the only button
                (issueData.status?.toLowerCase() !== "closed" ||
                  userType !== "citizen") &&
                  (userType !== "ngo" ||
                    issueData.status?.toLowerCase() !== "open") &&
                  styles.closeButtonFullWidth,
              ]}
              onPress={onClose}
            >
              <Ionicons name="close-circle" size={20} color="#666" />
              <Text style={styles.actionButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  modalContent: {
    height: "90%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.1)",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    padding: 5,
  },
  image: {
    width: "100%",
    height: 250,
    resizeMode: "cover",
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0, 0, 0, 0.05)",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  locationIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  locationText: {
    fontSize: 15,
    color: "#555",
    flex: 1,
  },
  uploaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  uploaderText: {
    fontSize: 14,
    color: "#666",
    flex: 1,
  },
  uploaderName: {
    fontWeight: "600",
    color: "#4285f4",
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statItem: {
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    textTransform: "capitalize",
  },
  co2SavedValue: {
    color: "#4CAF79",
  },
  descriptionText: {
    fontSize: 15,
    color: "#444",
    lineHeight: 22,
  },
  impactScoreContainer: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    padding: 15,
    borderRadius: 12,
  },
  impactScoreValue: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#333",
  },
  impactScoreLabel: {
    fontSize: 18,
    color: "#666",
    marginLeft: 5,
  },
  detectedIssueCard: {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#4285f4",
  },
  issueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  issueType: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  severityText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  issueDetail: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "500",
  },
  detailValue: {
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
  },
  issueTextSection: {
    marginTop: 12,
  },
  issueTextLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 6,
  },
  issueTextContent: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
  },
  confidenceNote: {
    fontSize: 12,
    color: "#666",
    marginTop: 6,
    fontStyle: "italic",
  },
  upvotesContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    padding: 15,
    borderRadius: 12,
  },
  upvoteItem: {
    alignItems: "center",
  },
  upvoteValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#333",
  },
  upvoteLabel: {
    fontSize: 12,
    color: "#666",
    marginTop: 4,
  },
  dateText: {
    fontSize: 14,
    color: "#555",
  },
  actionFooter: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
    gap: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  likeButton: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#4285f4",
  },
  likeButtonActive: {
    backgroundColor: "#4285f4",
    borderColor: "#4285f4",
  },
  uploadFixButton: {
    backgroundColor: "#4CAF79",
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#4285f4",
  },
  actionButtonTextActive: {
    color: "#fff",
  },
  // Fixed Button styles (for closed issues)
  fixedButton: {
    borderWidth: 2,
    borderColor: "#4CAF79",
    backgroundColor: "#fff",
  },
  fixedButtonActive: {
    backgroundColor: "#4CAF79",
    borderColor: "#45a06d",
  },
  fixedButtonText: {
    color: "#4CAF79",
  },
  // Not Fixed Button styles (for closed issues)
  notFixedButton: {
    borderWidth: 2,
    borderColor: "#dc3545",
    backgroundColor: "#fff",
  },
  notFixedButtonActive: {
    backgroundColor: "#dc3545",
    borderColor: "#c82333",
  },
  notFixedButtonText: {
    color: "#dc3545",
  },
  // Close button styles
  closeButtonStyle: {
    backgroundColor: "#f0f0f0",
  },
  closeButtonFullWidth: {
    flex: 1,
  },
  fixStatusContainer: {
    backgroundColor: "rgba(255, 255, 255, 0.6)",
    padding: 16,
    borderRadius: 12,
  },
  fixStatusItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  fixStatusLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  fixStatusValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#999",
  },
  fixStatusValueFixed: {
    color: "#4CAF79",
  },
  fixStatusValueNotFixed: {
    color: "#dc3545",
  },
  loadingFixContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 10,
  },
  loadingFixText: {
    fontSize: 14,
    color: "#666",
  },
  fixDetailsContainer: {
    gap: 20,
  },
  fixTitleSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#4CAF79",
  },
  fixTitleHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  fixTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#2C3E50",
    lineHeight: 26,
    flex: 1,
  },
  fixImagesSection: {
    marginBottom: 16,
  },
  fixPhotosHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  photoCountBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(76, 175, 121, 0.1)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  photoCountText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#4CAF79",
  },
  fixSubtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  fixImageGallery: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f0f0f0",
  },
  fixMainImage: {
    width: "100%",
    height: 220,
    resizeMode: "cover",
  },
  fixImageNavigation: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  fixImageNavButton: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    borderRadius: 24,
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fixImageCounterContainer: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
  },
  fixImageCounter: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  paginationDots: {
    position: "absolute",
    bottom: 16,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255, 255, 255, 0.5)",
  },
  paginationDotActive: {
    backgroundColor: "#4CAF79",
    width: 24,
  },
  fixedBySection: {
    marginBottom: 16,
  },
  fixedByCard: {
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF79",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  fixedByHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  fixedByInfo: {
    flex: 1,
  },
  fixedByName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 4,
  },
  organizationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  organizationText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  ngoBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  ngoBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4CAF79",
  },
  fixDescriptionSection: {
    marginBottom: 16,
  },
  fixDescriptionCard: {
    backgroundColor: "rgba(76, 175, 121, 0.08)",
    borderLeftWidth: 3,
    borderLeftColor: "#4CAF79",
    borderRadius: 8,
    padding: 14,
  },
  fixDescriptionText: {
    fontSize: 15,
    color: "#2C3E50",
    lineHeight: 24,
    letterSpacing: 0.2,
  },
  fixDateSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  fixDateText: {
    fontSize: 13,
    color: "#666",
    fontStyle: "italic",
  },
  noFixDataText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    padding: 20,
    fontStyle: "italic",
  },
  // Outcome styles for closed issues
  outcomeOverallCard: {
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF79",
  },
  outcomeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  outcomeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
  },
  outcomeValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  outcomeSuccess: {
    color: "#4CAF79",
  },
  co2SavedText: {
    color: "#4CAF79",
  },
  perIssueTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginTop: 8,
    marginBottom: 12,
  },
  perIssueCard: {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#4285f4",
  },
  perIssueHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  perIssueType: {
    fontSize: 15,
    fontWeight: "700",
    color: "#333",
    flex: 1,
  },
  fixStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  fixStatusText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  perIssueDetail: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  perIssueDetailLabel: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  perIssueDetailValue: {
    fontSize: 13,
    color: "#333",
    fontWeight: "600",
  },
  perIssueNotesSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(0, 0, 0, 0.1)",
  },
  perIssueNotesLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  perIssueNotesText: {
    fontSize: 13,
    color: "#555",
    lineHeight: 18,
  },
  evidencePhotosSection: {
    marginTop: 8,
  },
  evidencePhotosLabel: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
  },
});

export default IssueDetailModal;
