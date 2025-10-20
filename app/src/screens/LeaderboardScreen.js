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

const LeaderboardScreen = () => {
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      setLoading(true);
      const response = await api.get("/leaderboard");
      setLeaderboardData(response.data || []);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      // Set mock data for demonstration
      setLeaderboardData(generateMockData());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const generateMockData = () => {
    return [
      { rank: 1, name: "Citizen Hero", points: 2450, issues_reported: 49 },
      {
        rank: 2,
        name: "Community Champion",
        points: 2100,
        issues_reported: 42,
      },
      { rank: 3, name: "Civic Leader", points: 1850, issues_reported: 37 },
      { rank: 4, name: "Street Guardian", points: 1600, issues_reported: 32 },
      { rank: 5, name: "Urban Watcher", points: 1400, issues_reported: 28 },
      { rank: 6, name: "City Helper", points: 1200, issues_reported: 24 },
      { rank: 7, name: "Town Scout", points: 1050, issues_reported: 21 },
      { rank: 8, name: "Alert Citizen", points: 900, issues_reported: 18 },
      { rank: 9, name: "Watchful Eye", points: 750, issues_reported: 15 },
      { rank: 10, name: "Good Neighbor", points: 600, issues_reported: 12 },
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
        <Text style={styles.headerSubtitle}>Top Community Contributors</Text>
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
            {/* Top 3 Podium */}
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
                    {leaderboardData[1]?.points || 0} pts
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
                    {leaderboardData[0]?.points || 0} pts
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
                    {leaderboardData[2]?.points || 0} pts
                  </Text>
                  <View style={[styles.podiumBar, styles.podiumBarThird]} />
                </View>
              </View>
            )}

            {/* Rest of Leaderboard */}
            <View style={styles.listContainer}>
              {leaderboardData.slice(3).map((user, index) => (
                <View key={index} style={styles.listItem}>
                  <View style={styles.listItemLeft}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>{user.rank}</Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>{user.name}</Text>
                      <Text style={styles.userStats}>
                        {user.issues_reported} issues reported
                      </Text>
                    </View>
                  </View>
                  <View style={styles.pointsBadge}>
                    <Text style={styles.pointsText}>{user.points}</Text>
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
