import React from "react";
import {
    View,
    Text,
    Modal,
    StyleSheet,
    ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";

const UploadProgressModal = ({ visible, steps, currentStep }) => {
    return (
        <Modal visible={visible} transparent animationType="fade">
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <View style={styles.header}>
                        <MaterialIcons name="cloud-upload" size={48} color="#4285f4" />
                        <Text style={styles.title}>Processing Upload</Text>
                    </View>

                    <View style={styles.stepsContainer}>
                        {steps.map((step, index) => {
                            const isActive = index === currentStep;
                            const isCompleted = index < currentStep;

                            return (
                                <View key={index} style={styles.stepRow}>
                                    <View style={styles.stepIconContainer}>
                                        {isCompleted ? (
                                            <View style={styles.completedIcon}>
                                                <MaterialIcons
                                                    name="check"
                                                    size={20}
                                                    color="#fff"
                                                />
                                            </View>
                                        ) : isActive ? (
                                            <ActivityIndicator size="small" color="#4285f4" />
                                        ) : (
                                            <View style={styles.pendingIcon}>
                                                <Text style={styles.pendingNumber}>{index + 1}</Text>
                                            </View>
                                        )}
                                    </View>

                                    <View style={styles.stepContent}>
                                        <Text
                                            style={[
                                                styles.stepText,
                                                isActive && styles.stepTextActive,
                                                isCompleted && styles.stepTextCompleted,
                                            ]}
                                        >
                                            {step}
                                        </Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>

                    <Text style={styles.pleaseWait}>Please wait...</Text>
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
        borderRadius: 20,
        padding: 28,
        width: "85%",
        maxWidth: 400,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    header: {
        alignItems: "center",
        marginBottom: 28,
    },
    title: {
        fontSize: 20,
        fontWeight: "700",
        color: "#333",
        marginTop: 12,
    },
    stepsContainer: {
        gap: 20,
    },
    stepRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    stepIconContainer: {
        width: 40,
        height: 40,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 16,
    },
    completedIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#4CAF79",
        justifyContent: "center",
        alignItems: "center",
    },
    pendingIcon: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "#E0E0E0",
        justifyContent: "center",
        alignItems: "center",
    },
    pendingNumber: {
        fontSize: 16,
        fontWeight: "600",
        color: "#999",
    },
    stepContent: {
        flex: 1,
    },
    stepText: {
        fontSize: 15,
        color: "#999",
        fontWeight: "500",
    },
    stepTextActive: {
        color: "#4285f4",
        fontWeight: "600",
    },
    stepTextCompleted: {
        color: "#4CAF79",
        fontWeight: "600",
    },
    pleaseWait: {
        textAlign: "center",
        marginTop: 24,
        fontSize: 14,
        color: "#666",
        fontStyle: "italic",
    },
});

export default UploadProgressModal;
