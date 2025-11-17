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

const FixResultModal = ({ visible, onClose, result }) => {
    if (!result) return null;

    const { verification_result } = result;

    if (!verification_result) return null;

    const { overall_outcome, fix_outcomes, success_rate, co2_saved } =
        verification_result;

    const getOutcomeConfig = () => {
        switch (overall_outcome) {
            case "closed":
                return {
                    icon: "check-circle",
                    color: "#4CAF79",
                    title: "Fix Verified!",
                    subtitle: "Your fix has been successfully verified and accepted",
                };
            case "partially_closed":
                return {
                    icon: "warning",
                    color: "#FF9800",
                    title: "Partial Fix Verified",
                    subtitle: "Some issues were resolved, others need more work",
                };
            case "rejected":
                return {
                    icon: "cancel",
                    color: "#F44336",
                    title: "Fix Not Verified",
                    subtitle: "The issues appear to remain unaddressed",
                };
            case "needs_manual_review":
                return {
                    icon: "pending",
                    color: "#2196F3",
                    title: "Manual Review Required",
                    subtitle: "Your submission needs review by our team",
                };
            default:
                return {
                    icon: "info",
                    color: "#9E9E9E",
                    title: "Fix Submitted",
                    subtitle: "Your fix submission has been recorded",
                };
        }
    };

    const outcomeConfig = getOutcomeConfig();

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.overlay}>
                <View style={styles.container}>
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.headerIcon}>
                            <MaterialIcons
                                name={outcomeConfig.icon}
                                size={64}
                                color={outcomeConfig.color}
                            />
                        </View>
                        <Text style={styles.title}>{outcomeConfig.title}</Text>
                        <Text style={styles.subtitle}>{outcomeConfig.subtitle}</Text>
                    </View>

                    {/* Stats Row */}
                    <View style={styles.statsRow}>
                        {success_rate !== undefined && (
                            <View style={styles.statCard}>
                                <MaterialIcons name="analytics" size={24} color="#4285f4" />
                                <Text style={styles.statValue}>
                                    {(success_rate * 100).toFixed(0)}%
                                </Text>
                                <Text style={styles.statLabel}>Success Rate</Text>
                            </View>
                        )}

                        {co2_saved > 0 && (
                            <View style={styles.statCard}>
                                <MaterialIcons name="eco" size={24} color="#4CAF79" />
                                <Text style={[styles.statValue, styles.co2Value]}>
                                    {Math.round(co2_saved)} kg
                                </Text>
                                <Text style={styles.statLabel}>CO₂ Saved</Text>
                            </View>
                        )}
                    </View>

                    {/* Fix Outcomes List */}
                    {fix_outcomes && fix_outcomes.length > 0 && (
                        <ScrollView
                            style={styles.outcomesScrollView}
                            showsVerticalScrollIndicator={false}
                        >
                            <Text style={styles.outcomesListTitle}>Issues Fixed:</Text>
                            {fix_outcomes.map((outcome, index) => (
                                <View key={index} style={styles.outcomeCard}>
                                    <View style={styles.outcomeHeader}>
                                        <View
                                            style={[
                                                styles.outcomeIconBadge,
                                                {
                                                    backgroundColor:
                                                        outcome.fixed === "yes"
                                                            ? "#4CAF79"
                                                            : outcome.fixed === "partial"
                                                                ? "#FF9800"
                                                                : "#F44336",
                                                },
                                            ]}
                                        >
                                            <MaterialIcons
                                                name={
                                                    outcome.fixed === "yes"
                                                        ? "check"
                                                        : outcome.fixed === "partial"
                                                            ? "remove"
                                                            : "close"
                                                }
                                                size={18}
                                                color="#fff"
                                            />
                                        </View>
                                        <Text style={styles.outcomeType}>
                                            {getIssueDisplayName(outcome.issue_type)}
                                        </Text>
                                    </View>

                                    <View style={styles.outcomeDetails}>
                                        <View style={styles.outcomeDetailRow}>
                                            <MaterialIcons name="verified" size={16} color="#666" />
                                            <Text style={styles.outcomeDetailLabel}>Status:</Text>
                                            <View
                                                style={[
                                                    styles.fixStatusBadge,
                                                    {
                                                        backgroundColor:
                                                            outcome.fixed === "yes"
                                                                ? "#E8F5E9"
                                                                : outcome.fixed === "partial"
                                                                    ? "#FFF3E0"
                                                                    : "#FFEBEE",
                                                    },
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.fixStatusText,
                                                        {
                                                            color:
                                                                outcome.fixed === "yes"
                                                                    ? "#4CAF79"
                                                                    : outcome.fixed === "partial"
                                                                        ? "#FF9800"
                                                                        : "#F44336",
                                                        },
                                                    ]}
                                                >
                                                    {outcome.fixed === "yes"
                                                        ? "FIXED"
                                                        : outcome.fixed === "partial"
                                                            ? "PARTIAL"
                                                            : "NOT FIXED"}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.outcomeDetailRow}>
                                            <MaterialIcons name="speed" size={16} color="#666" />
                                            <Text style={styles.outcomeDetailLabel}>Confidence:</Text>
                                            <Text style={styles.outcomeDetailValue}>
                                                {(outcome.confidence * 100).toFixed(0)}%
                                            </Text>
                                        </View>

                                        {outcome.notes && (
                                            <View style={styles.notesSection}>
                                                <Text style={styles.notesLabel}>Notes:</Text>
                                                <Text style={styles.notesText}>{outcome.notes}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                    )}

                    {/* Karma Points Message */}
                    {overall_outcome === "closed" && (
                        <View style={styles.karmaMessage}>
                            <MaterialIcons name="star" size={20} color="#FFD700" />
                            <Text style={styles.karmaText}>
                                You've earned karma points for this fix!
                            </Text>
                        </View>
                    )}

                    {/* Close Button */}
                    <TouchableOpacity
                        style={[
                            styles.closeButton,
                            { backgroundColor: outcomeConfig.color },
                        ]}
                        onPress={onClose}
                    >
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
        maxHeight: "85%",
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
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-around",
        paddingHorizontal: 20,
        paddingVertical: 16,
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: "#F8F9FA",
        borderRadius: 12,
        padding: 16,
        alignItems: "center",
        gap: 6,
    },
    statValue: {
        fontSize: 22,
        fontWeight: "700",
        color: "#333",
    },
    co2Value: {
        color: "#4CAF79",
    },
    statLabel: {
        fontSize: 12,
        color: "#666",
        fontWeight: "500",
    },
    outcomesScrollView: {
        maxHeight: 320,
        padding: 20,
        paddingTop: 12,
    },
    outcomesListTitle: {
        fontSize: 16,
        fontWeight: "600",
        color: "#333",
        marginBottom: 16,
    },
    outcomeCard: {
        backgroundColor: "#F8F9FA",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: "#4285f4",
    },
    outcomeHeader: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 12,
        gap: 12,
    },
    outcomeIconBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: "center",
        alignItems: "center",
    },
    outcomeType: {
        fontSize: 16,
        fontWeight: "700",
        color: "#333",
        flex: 1,
    },
    outcomeDetails: {
        gap: 10,
    },
    outcomeDetailRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    outcomeDetailLabel: {
        fontSize: 14,
        color: "#666",
        fontWeight: "500",
    },
    outcomeDetailValue: {
        fontSize: 14,
        color: "#333",
        fontWeight: "600",
    },
    fixStatusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    fixStatusText: {
        fontSize: 11,
        fontWeight: "700",
    },
    notesSection: {
        marginTop: 6,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: "#E0E0E0",
    },
    notesLabel: {
        fontSize: 13,
        fontWeight: "600",
        color: "#555",
        marginBottom: 4,
    },
    notesText: {
        fontSize: 13,
        color: "#666",
        lineHeight: 18,
    },
    karmaMessage: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 20,
        paddingVertical: 16,
        backgroundColor: "#FFFBF0",
        borderRadius: 12,
        marginHorizontal: 20,
        marginBottom: 16,
    },
    karmaText: {
        fontSize: 14,
        color: "#F57C00",
        fontWeight: "600",
    },
    closeButton: {
        marginHorizontal: 20,
        marginBottom: 20,
        paddingVertical: 16,
        borderRadius: 12,
        alignItems: "center",
        shadowColor: "#000",
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

export default FixResultModal;
