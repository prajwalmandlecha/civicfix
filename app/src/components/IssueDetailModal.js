import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { getIssueDisplayName } from "../utils/issueTypeMapping";

const { width } = Dimensions.get("window");

const IssueDetailModal = ({
  visible,
  onClose,
  issueData,
  userType,
  onUploadFix,
}) => {
  const [isLiked, setIsLiked] = useState(false);

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
                <Text style={styles.locationIcon}>📍</Text>
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

            {/* Fix Status - Only for Closed Issues */}
            {issueData.status?.toLowerCase() === "closed" &&
              issueData.detailedData?.fix_status && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Fix Status</Text>
                  <View style={styles.fixStatusContainer}>
                    <View style={styles.fixStatusItem}>
                      <Text style={styles.fixStatusLabel}>Is Fixed:</Text>
                      <Text
                        style={[
                          styles.fixStatusValue,
                          issueData.detailedData.fix_status.is_fixed &&
                            styles.fixStatusValueFixed,
                        ]}
                      >
                        {issueData.detailedData.fix_status.is_fixed
                          ? "✅ Yes"
                          : "❌ No"}
                      </Text>
                    </View>
                    <View style={styles.fixStatusItem}>
                      <Text style={styles.fixStatusLabel}>Is Not Fixed:</Text>
                      <Text
                        style={[
                          styles.fixStatusValue,
                          issueData.detailedData.fix_status.is_not_fixed &&
                            styles.fixStatusValueNotFixed,
                        ]}
                      >
                        {issueData.detailedData.fix_status.is_not_fixed
                          ? "✅ Yes"
                          : "❌ No"}
                      </Text>
                    </View>
                  </View>
                </View>
              )}
          </ScrollView>

          {/* Action Buttons Footer */}
          <View style={styles.actionFooter}>
            {/* Upload Fix Button - Only for volunteers on open issues */}
            {userType === "volunteer" &&
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

            {/* Upload Fix Button - Only for citizens on closed issues */}
            {userType !== "volunteer" &&
            issueData.status?.toLowerCase() === "closed" ? (
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
});

export default IssueDetailModal;
