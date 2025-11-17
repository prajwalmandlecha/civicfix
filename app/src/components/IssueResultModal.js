import React from "react";
import {
    View,
    Text,
    Modal,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { getIssueDisplayName } from "../utils/issueTypeMapping";

const IssueResultModal = ({ visible, onClose, result }) => {
    if (!result) return null;

    const { detected_issues, no_issues_found } = result;

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerIcon}>
                            <MaterialIcons
                                name={no_issues_found ? "info" : "check-circle"}
                                size={56}
                                color={no_issues_found ? "#FF9800" : "#4CAF79"}
                            />
                        </View>
                        <Text style={styles.title}>
                            {no_issues_found ? "No Issues Found" : "Issues Identified"}
                        </Text>
                        <Text style={styles.subtitle}>
                            {no_issues_found
                                ? "No civic issues were detected in your image"
                                : `${detected_issues?.length || 0} issue${detected_issues?.length !== 1 ? "s" : ""
                                } detected and submitted`}
                        </Text>
                    </View>

                    {/* Issues List */}
                    {!no_issues_found && detected_issues && detected_issues.length > 0 && (
                        <ScrollView
                            style={styles.issuesScrollView}
                            showsVerticalScrollIndicator={false}
                        >
                            <Text style={styles.issuesListTitle}>Detected Issues:</Text>
                            {detected_issues.map((issue, index) => (
                                <View key={index} style={styles.issueCard}>
                                    <View style={styles.issueHeader}>
                                        <View style={styles.issueNumberBadge}>
                                            <Text style={styles.issueNumberText}>{index + 1}</Text>
                                        </View>
                                        <Text style={styles.issueType}>
                                            {getIssueDisplayName(issue.type)}
                                        </Text>
                                    </View>

                                    <View style={styles.issueDetails}>
                                        <View style={styles.detailRow}>
                                            <MaterialIcons name="warning" size={16} color="#666" />
                                            <Text style={styles.detailLabel}>Severity:</Text>
                                            <View
                                                style={[
                                                    styles.severityBadge,
                                                    {
                                                        backgroundColor:
                                                            issue.severity === "high"
                                                                ? "#F44336"
                                                                : issue.severity === "medium"
                                                                    ? "#FF9800"
                                                                    : "#4CAF79",
                                                    },
                                                ]}
                                            >
                                                <Text style={styles.severityText}>
                                                    {issue.severity?.toUpperCase()}
                                                </Text>
                                            </View>
                                        </View>

                                        {issue.severity_score && (
                                            <View style={styles.detailRow}>
                                                <MaterialIcons name="speed" size={16} color="#666" />
                                                <Text style={styles.detailLabel}>Score:</Text>
                                                <Text style={styles.detailValue}>
                                                    {issue.severity_score}/10
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    )}

                    {/* Success Message */}
                    {!no_issues_found && (
                        <View style={styles.successMessage}>
                            <MaterialIcons name="check" size={20} color="#4CAF79" />
                            <Text style={styles.successText}>
                                Your report has been submitted successfully!
                            </Text>
                        </View>
                    )}

                    {/* Close Button */}
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <Text style={styles.closeButtonText}>Close</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: "rgba(0, 0, 0, 0.7)",
        justifyContent: "center",
        alignItems: "center",
    },
    container: {
        backgroundColor: "#fff",
        borderRadius: 24,
        width: "90%",
        maxWidth: 450,
        maxHeight: "80%",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    header: {
        alignItems: "center",
        padding: 28,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: "#E0E0E0",
    },
    headerIcon: {
        marginBottom: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: "700",
        color: "#333",
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 15,
        color: "#666",
        textAlign: "center",
        lineHeight: 22,
    },
    issuesScrollView: {
        maxHeight: 320,
        padding: 20,
        paddingTop: 16,
    },
    issuesListTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#333",
        marginBottom: 16,
    },
    issueCard: {
        backgroundColor: "#F8F9FA",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: "#4285f4",
    },
    issueHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
        gap: 10,
    },
    issueNumberBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "#4285f4",
        justifyContent: "center",
        alignItems: "center",
    },
    issueNumberText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    issueType: {
        fontSize: 16,
        fontWeight: "700",
        color: "#333",
        flex: 1,
    },
    issueDetails: {
        gap: 8,
    },
    detailRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
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
    severityBadge: {
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 12,
    },
    severityText: {
        fontSize: 11,
        fontWeight: "700",
        color: "#fff",
    },
    successMessage: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: "#E8F5E9",
        borderRadius: 12,
        marginHorizontal: 20,
        marginBottom: 16,
    },
    successText: {
        fontSize: 14,
        color: "#4CAF79",
        fontWeight: "600",
    },
    closeButton: {
        backgroundColor: "#4285f4",
        marginHorizontal: 20,
        marginBottom: 20,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: "center",
        shadowColor: "#4285f4",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
        elevation: 4,
    },
    closeButtonText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#fff",
    },
});

export default IssueResultModal;
