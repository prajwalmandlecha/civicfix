import React from "react";
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
import { getIssueDisplayName } from "../utils/issueTypeMapping";

const { width } = Dimensions.get("window");

const IssueDetailModal = ({ visible, onClose, issueData }) => {
  if (!issueData) return null;

  const getImpactColor = () => {
    if (issueData.impactLevel === "High") return "#ffebee";
    if (issueData.impactLevel === "Medium") return "#fff3e0";
    return "#e8f5e9";
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

            {/* Status & Severity */}
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
          </ScrollView>
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
});

export default IssueDetailModal;
