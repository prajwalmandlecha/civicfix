import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import api from "../services/api";
import { useUserContext } from "../context/UserContext";

const LeaderboardScreen = () => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { userType } = useUserContext();

  useEffect(() => {
    fetchLeaderboard();
  }, [userType]);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      // Fetch appropriate leaderboard based on user type
      const endpoint =
        userType === "ngo"
          ? "/api/leaderboard/ngos"
          : "/api/leaderboard/citizens";
      const response = await api.get(endpoint);
      setLeaderboardData(response.data.leaderboard || []);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      // Set mock data for demonstration
      setLeaderboardData(generateMockData(userType === "ngo"));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const generateMockData = (isNGO = false) => {
    if (isNGO) {
      return [
        { rank: 1, name: "Community Builders NGO", co2: 3200, badges: [] },
        { rank: 2, name: "Green Earth Foundation", co2: 2850, badges: [] },
        { rank: 3, name: "Urban Care Society", co2: 2400, badges: [] },
        { rank: 4, name: "Fix It Forward", co2: 2100, badges: [] },
        { rank: 5, name: "City NGO Network", co2: 1900, badges: [] },
        { rank: 6, name: "Road Warriors", co2: 1600, badges: [] },
        { rank: 7, name: "Clean Streets Initiative", co2: 1400, badges: [] },
        { rank: 8, name: "Civic Action Team", co2: 1200, badges: [] },
        { rank: 9, name: "Local Heroes", co2: 1000, badges: [] },
        { rank: 10, name: "Community First", co2: 800, badges: [] },
      ];
    }
    return [
      { rank: 1, name: "Citizen Hero", co2: 2450, badges: [] },
      { rank: 2, name: "Community Champion", co2: 2100, badges: [] },
      { rank: 3, name: "Civic Leader", co2: 1850, badges: [] },
      { rank: 4, name: "Street Guardian", co2: 1600, badges: [] },
      { rank: 5, name: "Urban Watcher", co2: 1400, badges: [] },
      { rank: 6, name: "City Helper", co2: 1200, badges: [] },
      { rank: 7, name: "Town Scout", co2: 1050, badges: [] },
      { rank: 8, name: "Alert Citizen", co2: 900, badges: [] },
      { rank: 9, name: "Watchful Eye", co2: 750, badges: [] },
      { rank: 10, name: "Good Neighbor", co2: 600, badges: [] },
    ];
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeaderboard();
  };

  const getRankColor = (rank) => {
    switch (rank) {
      case 1:
        return "#FFD700"; // Gold
      case 2:
        return "#C0C0C0"; // Silver
      case 3:
        return "#CD7F32"; // Bronze
      default:
        return "#4285f4";
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4285f4" />
        <Text style={styles.loadingText}>Loading leaderboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Leaderboard</Text>
        <Text style={styles.headerSubtitle}>
          {userType === "ngo"
            ? "Top NGO Organizations"
            : "Top Community Contributors"}
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {leaderboardData.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>No Data Yet</Text>
            <Text style={styles.emptySubtitle}>
              Start reporting issues to appear on the leaderboard!
            </Text>
          </View>
        ) : (
          <>
            {/* Top 3 Podium - only show if we have at least 3 users */}
            {leaderboardData.length >= 3 && (
              <View style={styles.podiumContainer}>
                {/* Second Place */}
                <View style={styles.podiumItem}>
                  <View
                    style={[
                      styles.podiumRank,
                      { backgroundColor: getRankColor(2) },
                    ]}
                  >
                    <Text style={styles.podiumNumber}>2</Text>
                  </View>
                  <Text style={styles.podiumName}>
                    {leaderboardData[1]?.name || "N/A"}
                  </Text>
                  <Text style={styles.podiumPoints}>
                    {leaderboardData[1]?.co2 || 0} pts
                  </Text>
                  <View style={[styles.podiumBar, styles.podiumBarSecond]} />
                </View>

                {/* First Place */}
                <View style={styles.podiumItem}>
                  <View
                    style={[
                      styles.podiumRank,
                      { backgroundColor: getRankColor(1) },
                    ]}
                  >
                    <Text style={styles.podiumNumber}>1</Text>
                  </View>
                  <Text style={styles.podiumName}>
                    {leaderboardData[0]?.name || "N/A"}
                  </Text>
                  <Text style={styles.podiumPoints}>
                    {leaderboardData[0]?.co2 || 0} pts
                  </Text>
                  <View style={[styles.podiumBar, styles.podiumBarFirst]} />
                </View>

                {/* Third Place */}
                <View style={styles.podiumItem}>
                  <View
                    style={[
                      styles.podiumRank,
                      { backgroundColor: getRankColor(3) },
                    ]}
                  >
                    <Text style={styles.podiumNumber}>3</Text>
                  </View>
                  <Text style={styles.podiumName}>
                    {leaderboardData[2]?.name || "N/A"}
                  </Text>
                  <Text style={styles.podiumPoints}>
                    {leaderboardData[2]?.co2 || 0} pts
                  </Text>
                  <View style={[styles.podiumBar, styles.podiumBarThird]} />
                </View>
              </View>
            )}

            {/* Rest of Leaderboard - show all users if less than 3, otherwise show from position 4 onwards */}
            <View style={styles.listContainer}>
              {(leaderboardData.length < 3
                ? leaderboardData
                : leaderboardData.slice(3)
              ).map((user, index) => (
                <View key={index} style={styles.listItem}>
                  <View style={styles.listItemLeft}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>{user.rank}</Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{user.name}</Text>
                      <Text style={styles.userStats}>
                        {user.badges?.length || 0} badges earned
                      </Text>
                    </View>
                  </View>
                  <View style={styles.pointsBadge}>
                    <Text style={styles.pointsText}>{user.co2}</Text>
                    <Text style={styles.pointsLabel}>pts</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#666",
  },
  header: {
    backgroundColor: "#4285f4",
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#e3f2fd",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  podiumContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  podiumItem: {
    alignItems: "center",
    flex: 1,
    marginHorizontal: 4,
  },
  podiumRank: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  podiumNumber: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#fff",
  },
  podiumName: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
    textAlign: "center",
    marginBottom: 4,
  },
  podiumPoints: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#4285f4",
    marginBottom: 8,
  },
  podiumBar: {
    width: "100%",
    backgroundColor: "#4285f4",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  podiumBarFirst: {
    height: 100,
  },
  podiumBarSecond: {
    height: 70,
  },
  podiumBarThird: {
    height: 50,
  },
  listContainer: {
    marginTop: 16,
    paddingHorizontal: 16,
  },
  listItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  listItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e3f2fd",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  rankText: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#4285f4",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 2,
  },
  userStats: {
    fontSize: 12,
    color: "#999",
  },
  pointsBadge: {
    alignItems: "center",
    paddingHorizontal: 12,
  },
  pointsText: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4285f4",
  },
  pointsLabel: {
    fontSize: 10,
    color: "#999",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
  },
});

export default LeaderboardScreen;
