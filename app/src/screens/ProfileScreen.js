import React, { useState, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
} from "react-native";
import { auth, firestore } from "../services/firebase";
import { getDoc, doc, updateDoc } from "firebase/firestore";
import Card from "../components/Card";
import StatCard from "../components/StatCard";
import { getCurrentLocation } from "../services/getLocation";
import { useUserContext } from "../context/UserContext";
import api from "../services/api";

const ProfileScreen = () => {
  const [userData, setUserData] = useState(null);
  const [stats, setStats] = useState({
    issuesUploaded: 0,
    issuesResolved: 0,
    co2Saved: 0,
    currentRank: 0,
    totalKarma: 0,
  });
  const [badges, setBadges] = useState([]);
  const [loadingLocation, setLoadingLocation] = useState(false);
  const [loadingStats, setLoadingStats] = useState(true);
  const [organization, setOrganization] = useState("");
  const [editingOrganization, setEditingOrganization] = useState(false);

  const { updateLastLocation, lastLocation, userType } = useUserContext();

  const fetchUserData = async () => {
    try {
      setLoadingStats(true);

      // Fetch user data from Firestore (for basic info and organization)
      const userDoc = await getDoc(
        doc(firestore, "users", auth.currentUser.uid)
      );
      const data = userDoc.data();
      setUserData(data);
      setOrganization(data?.organization || "");

      // Fetch detailed stats from backend API
      const response = await api.get(
        `/api/users/${auth.currentUser.uid}/stats`
      );
      const statsData = response.data.stats;

      console.log("User Stats from Backend:", statsData);

      // Update stats state
      setStats({
        issuesUploaded: statsData.issuesReported || 0,
        issuesResolved: statsData.issuesResolved || 0,
        issuesFixed: statsData.issuesFixed || 0, // For volunteers
        co2Saved: statsData.co2Saved || 0,
        currentRank: statsData.currentRank || 0,
        totalKarma: statsData.karma || 0,
      });

      // Update badges if available
      if (statsData.badges && statsData.badges.length > 0) {
        setBadges(statsData.badges);
      } else {
        // Set default badges based on achievements
        const earnedBadges = [];
        if (statsData.issuesReported >= 1) {
          earnedBadges.push({ emoji: "🌟", title: "First Report" });
        }
        if (statsData.issuesReported >= 10) {
          earnedBadges.push({ emoji: "⭐", title: "10 Reports" });
        }
        if (statsData.karma >= 100) {
          earnedBadges.push({ emoji: "🏆", title: "100 Karma" });
        }
        if (statsData.issuesResolved >= 5) {
          earnedBadges.push({ emoji: "✅", title: "Problem Solver" });
        }
        if (statsData.issuesFixed >= 5) {
          earnedBadges.push({ emoji: "🔧", title: "Community Fixer" });
        }
        setBadges(earnedBadges);
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      Alert.alert(
        "Error",
        "Failed to load profile data. Please check your connection and try again."
      );
    } finally {
      setLoadingStats(false);
    }
  };

  const handleUpdateOrganization = async () => {
    if (!organization.trim()) {
      Alert.alert("Error", "Please enter an organization name.");
      return;
    }

    try {
      await updateDoc(doc(firestore, "users", auth.currentUser.uid), {
        organization: organization.trim(),
      });
      Alert.alert("Success", "Organization updated successfully!");
      setEditingOrganization(false);
      await fetchUserData(); // Refresh user data
    } catch (error) {
      console.error("Error updating organization:", error);
      Alert.alert("Error", "Failed to update organization. Please try again.");
    }
  };

  const handleSetLocation = async () => {
    const { addressParts, location } = await getCurrentLocation(
      setLoadingLocation
    );
    if (location && addressParts) {
      const formattedAddress = [
        addressParts.street,
        addressParts.city,
        addressParts.region,
        addressParts.postalCode,
        addressParts.country,
      ]
        .filter(Boolean)
        .join(", ");
      updateLastLocation({ ...location, address: formattedAddress });
    }
  };

  useLayoutEffect(() => {
    fetchUserData();
  }, []);

  const getUserDisplayName = () => {
    return (
      auth.currentUser?.displayName ||
      userData?.name ||
      `User ${auth.currentUser?.uid?.substring(0, 6)}`
    );
  };

  if (loadingStats) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#4285f4" />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {getUserDisplayName().charAt(0).toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.username}>{getUserDisplayName()}</Text>
        <Text style={styles.userEmail}>{auth.currentUser?.email}</Text>
        <View style={styles.userTypeBadge}>
          <Text style={styles.userTypeText}>
            {userData?.userType === "volunteer" ? "🔧 Volunteer" : "👤 Citizen"}
          </Text>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.headerStatItem}>
            <Text style={styles.headerStatValue}>{stats.totalKarma}</Text>
            <Text style={styles.headerStatLabel}>Total Karma</Text>
          </View>
          <View style={styles.headerStatDivider} />
          <View style={styles.headerStatItem}>
            <Text style={styles.headerStatValue}>
              {stats.currentRank > 0 ? `#${stats.currentRank}` : "N/A"}
            </Text>
            <Text style={styles.headerStatLabel}>Rank</Text>
          </View>
        </View>
      </View>

      {/* Location Section - styled and placed after header */}
      <Card style={styles.locationCard}>
        <Text style={styles.locationLabel}>Current Location</Text>
        <Text style={styles.locationText}>
          {lastLocation?.address || "Not set"}
        </Text>
        <View style={styles.locationButtonWrapper}>
          <View style={styles.locationButton}>
            <Text
              style={styles.locationButtonText}
              onPress={loadingLocation ? undefined : handleSetLocation}
            >
              {loadingLocation ? "Updating..." : "Update Location"}
            </Text>
          </View>
        </View>
      </Card>

      {/* Organization Section - Only for Volunteers */}
      {(userData?.userType === "volunteer" || userType === "volunteer") && (
        <Card style={styles.organizationCard}>
          <Text style={styles.organizationLabel}>Organization</Text>
          {editingOrganization ? (
            <>
              <TextInput
                style={styles.organizationInput}
                placeholder="Enter your organization name"
                value={organization}
                onChangeText={setOrganization}
                autoFocus
              />
              <View style={styles.organizationButtonRow}>
                <View style={styles.organizationButtonWrapper}>
                  <Text
                    style={styles.organizationCancelButton}
                    onPress={() => {
                      setOrganization(userData?.organization || "");
                      setEditingOrganization(false);
                    }}
                  >
                    Cancel
                  </Text>
                </View>
                <View style={styles.organizationButtonWrapper}>
                  <Text
                    style={styles.organizationSaveButton}
                    onPress={handleUpdateOrganization}
                  >
                    Save
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.organizationText}>
                {userData?.organization || "Not set"}
              </Text>
              <View style={styles.organizationButtonWrapper}>
                <View style={styles.organizationButton}>
                  <Text
                    style={styles.organizationButtonText}
                    onPress={() => setEditingOrganization(true)}
                  >
                    Update Organization
                  </Text>
                </View>
              </View>
            </>
          )}
        </Card>
      )}

      {/* Stats Grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📊 Your Impact</Text>
        <View style={styles.statsGrid}>
          {userData?.userType === "volunteer" ? (
            <>
              <View style={styles.statCardWrapper}>
                <StatCard
                  emoji="�"
                  number={stats.issuesFixed || 0}
                  label="Issues Fixed"
                  size="small"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  emoji="📊"
                  number={stats.totalKarma}
                  label="Total Karma"
                  size="small"
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.statCardWrapper}>
                <StatCard
                  emoji="📸"
                  number={stats.issuesUploaded}
                  label="Issues Reported"
                  size="small"
                />
              </View>
              <View style={styles.statCardWrapper}>
                <StatCard
                  emoji="✅"
                  number={stats.issuesResolved}
                  label="Issues Resolved"
                  size="small"
                />
              </View>
            </>
          )}
        </View>
        <View style={styles.statsGridFull}>
          <StatCard
            emoji="🌍"
            number={`${stats.co2Saved}kg`}
            label="CO₂ Saved"
            size="medium"
          />
        </View>
      </View>

      {/* Badges Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏅 Badges & Achievements</Text>
        <Card style={styles.badgesCard}>
          <View style={styles.badgesGrid}>
            {badges.map((badge, index) => (
              <View key={index} style={styles.badgeItem}>
                <Text style={styles.badgeEmoji}>{badge.emoji}</Text>
                <Text style={styles.badgeTitle}>{badge.title}</Text>
              </View>
            ))}
          </View>
        </Card>
      </View>

      {/* Bottom Padding */}
      <View style={styles.bottomPadding} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
    fontWeight: "600",
  },
  header: {
    backgroundColor: "#ffffff",
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#4285f4",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: "700",
    color: "#ffffff",
  },
  username: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
  },
  userTypeBadge: {
    backgroundColor: "#E8F5E9",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 20,
  },
  userTypeText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4CAF79",
  },
  headerStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingHorizontal: 40,
  },
  headerStatItem: {
    flex: 1,
    alignItems: "center",
  },
  headerStatValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#4CAF79",
    marginBottom: 4,
  },
  headerStatLabel: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerStatDivider: {
    width: 1,
    height: 40,
    backgroundColor: "#e5e7eb",
    marginHorizontal: 20,
  },
  section: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1a1a1a",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  statCardWrapper: {
    flex: 1,
    marginHorizontal: 6,
  },
  statsGridFull: {
    marginHorizontal: 6,
  },
  badgesCard: {
    padding: 20,
  },
  locationCard: {
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    alignItems: "flex-start",
  },
  locationLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4285f4",
    marginBottom: 6,
  },
  locationText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 14,
    minHeight: 18,
  },
  locationButtonWrapper: {
    width: "100%",
    alignItems: "flex-end",
  },
  locationButton: {
    backgroundColor: "#4285f4",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  locationButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  organizationCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    alignItems: "flex-start",
  },
  organizationLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4CAF79",
    marginBottom: 6,
  },
  organizationText: {
    fontSize: 14,
    color: "#333",
    marginBottom: 14,
    minHeight: 18,
  },
  organizationButtonWrapper: {
    width: "100%",
    alignItems: "flex-end",
  },
  organizationButton: {
    backgroundColor: "#4CAF79",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 120,
  },
  organizationButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    letterSpacing: 0.2,
  },
  organizationInput: {
    fontSize: 14,
    color: "#333",
    borderWidth: 1,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  organizationButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  organizationCancelButton: {
    color: "#666",
    fontWeight: "600",
    fontSize: 15,
    paddingVertical: 8,
    paddingHorizontal: 18,
  },
  organizationSaveButton: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
    backgroundColor: "#4CAF79",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 18,
    overflow: "hidden",
  },
  badgesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
  },
  badgeItem: {
    alignItems: "center",
    width: "23%",
    marginBottom: 20,
  },
  badgeEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  badgeTitle: {
    fontSize: 10,
    color: "#6B7280",
    textAlign: "center",
    fontWeight: "600",
  },
  bottomPadding: {
    height: 40,
  },
  loadingStatsContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  loadingStatsText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
});

export default ProfileScreen;
