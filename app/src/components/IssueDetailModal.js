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
            </View>

            {/* Status & Severity & CO2 Saved */}
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
                  <Text style={styles.statLabel}>CO₂ Risk</Text>
                  <Text style={styles.statValue}>
                    {issueData.detailedData?.fate_risk_co2
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
                    {/* Fix Images Gallery */}
                    {fixDetails.image_urls &&
                      fixDetails.image_urls.length > 0 && (
                        <View style={styles.fixImagesSection}>
                          <Text style={styles.fixSubtitle}>Fix Photos</Text>
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
                                    size={20}
                                    color="#fff"
                                  />
                                </TouchableOpacity>
                                <Text style={styles.fixImageCounter}>
                                  {currentFixImageIndex + 1} /{" "}
                                  {fixDetails.image_urls.length}
                                </Text>
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
                                    size={20}
                                    color="#fff"
                                  />
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                        </View>
                      )}

                    {/* Fixed By Information */}
                    <View style={styles.fixedBySection}>
                      <Text style={styles.fixSubtitle}>Fixed By</Text>
                      <View style={styles.fixedByCard}>
                        <View style={styles.fixedByHeader}>
                          <Ionicons
                            name="person-circle"
                            size={40}
                            color="#4CAF79"
                          />
                          <View style={styles.fixedByInfo}>
                            <Text style={styles.fixedByName}>
                              {fixDetails.fixed_by.name}
                            </Text>
                            {fixDetails.fixed_by.organization && (
                              <View style={styles.organizationRow}>
                                <Ionicons
                                  name="business"
                                  size={14}
                                  color="#666"
                                />
                                <Text style={styles.organizationText}>
                                  {fixDetails.fixed_by.organization}
                                </Text>
                              </View>
                            )}
                            <View style={styles.volunteerBadge}>
                              <Ionicons
                                name="construct"
                                size={12}
                                color="#4CAF79"
                              />
                              <Text style={styles.volunteerBadgeText}>
                                {fixDetails.fixed_by.userType === "ngo"
                                  ? "NGO"
                                  : "Volunteer"}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* Fix Description */}
                    {fixDetails.description && (
                      <View style={styles.fixDescriptionSection}>
                        <Text style={styles.fixSubtitle}>Fix Description</Text>
                        <Text style={styles.fixDescriptionText}>
                          {fixDetails.description}
                        </Text>
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

            {/* Description */}
            {issueData.detailedData?.description && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.descriptionText}>
                  {issueData.detailedData.description}
                </Text>
              </View>
            )}

            {/* Detected Issues */}
            {issueData.detailedData?.detected_issues && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Detected Issues</Text>
                {issueData.detailedData.detected_issues.map((issue, index) => (
                  <View key={index} style={styles.detectedIssueCard}>
                    <View style={styles.issueHeader}>
                      <Text style={styles.issueType}>
                        {getIssueDisplayName(issue.type)}
                      </Text>
                      <View
                        style={[
                          styles.severityBadge,
                          {
                            backgroundColor: getSeverityColor(issue.severity),
                          },
                        ]}
                      >
                        <Text style={styles.severityText}>
                          {issue.severity.toUpperCase()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.issueDetail}>
                      <Text style={styles.detailLabel}>Severity Score:</Text>
                      <Text style={styles.detailValue}>
                        {issue.severity_score}/10
                      </Text>
                    </View>

                    <View style={styles.issueTextSection}>
                      <Text style={styles.issueTextLabel}>Future Impact:</Text>
                      <Text style={styles.issueTextContent}>
                        {issue.future_impact}
                      </Text>
                    </View>

                    <View style={styles.issueTextSection}>
                      <Text style={styles.issueTextLabel}>Predicted Fix:</Text>
                      <Text style={styles.issueTextContent}>
                        {issue.predicted_fix}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
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
            {/* Upload Fix Button - ONLY for volunteers/NGOs on OPEN issues */}
            {(userType === "volunteer" || userType === "ngo") &&
            issueData.status?.toLowerCase() === "open" ? (
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

            {/* Close Button - For closed issues, just show a close button */}
            <TouchableOpacity
              style={[styles.actionButton, styles.closeButton]}
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
    gap: 16,
  },
  fixImagesSection: {
    marginBottom: 12,
  },
  fixSubtitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 10,
  },
  fixImageGallery: {
    position: "relative",
    borderRadius: 12,
    overflow: "hidden",
  },
  fixMainImage: {
    width: "100%",
    height: 200,
    resizeMode: "cover",
    backgroundColor: "#f0f0f0",
  },
  fixImageNavigation: {
    position: "absolute",
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  fixImageNavButton: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: "center",
    alignItems: "center",
  },
  fixImageCounter: {
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    fontSize: 13,
    fontWeight: "600",
  },
  fixedBySection: {
    marginBottom: 12,
  },
  fixedByCard: {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#4CAF79",
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
  volunteerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  volunteerBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#4CAF79",
  },
  fixDescriptionSection: {
    marginBottom: 12,
  },
  fixDescriptionText: {
    fontSize: 14,
    color: "#555",
    lineHeight: 20,
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
});

export default IssueDetailModal;
