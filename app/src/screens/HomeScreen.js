import React, { useState, useEffect, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import SocialPost from "../components/SocialPost";
import IssueDetailModal from "../components/IssueDetailModal";
import api from "../services/api";
import { useUserContext } from "../context/UserContext";
import * as Location from "expo-location";

const HomeScreen = ({ navigation }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filters, setFilters] = useState({
    status: "all", // all, open, closed
    severity: "all", // all, high, medium, low
    sortBy: "severity", // severity, date, likes
  });

  const { lastLocation, userType } = useUserContext();

  useEffect(() => {
    getPosts();
  }, [lastLocation, filters]);

  // Apply filters to posts
  const getFilteredPosts = () => {
    let filteredPosts = [...posts];

    // Filter by status
    if (filters.status !== "all") {
      filteredPosts = filteredPosts.filter(
        (post) => post.status?.toLowerCase() === filters.status
      );
    }

    // Filter by severity
    if (filters.severity !== "all") {
      filteredPosts = filteredPosts.filter((post) => {
        switch (filters.severity) {
          case "high":
            return post.severityScore > 7;
          case "medium":
            return post.severityScore > 4 && post.severityScore <= 7;
          case "low":
            return post.severityScore <= 4;
          default:
            return true;
        }
      });
    }

    // Sort posts
    filteredPosts.sort((a, b) => {
      switch (filters.sortBy) {
        case "date":
          return new Date(b.createdAt) - new Date(a.createdAt);
        case "likes":
          return b.likes - a.likes;
        case "severity":
        default:
          return b.severityScore - a.severityScore;
      }
    });

    return filteredPosts;
  };

  // Handle filter changes
  const updateFilter = (filterType, value) => {
    setFilters((prev) => ({ ...prev, [filterType]: value }));
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({
      status: "all",
      severity: "all",
      sortBy: "severity",
    });
  };

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || !lastLocation?.coords) return;

    console.log(
      `Loading more issues... Current posts: ${posts.length}, Page: ${page}`
    );
    setLoadingMore(true);
    const nextPage = page + 1;

    try {
      const response = await api.get("/issues/", {
        params: {
          latitude: lastLocation.coords.latitude,
          longitude: lastLocation.coords.longitude,
          limit: 20,
          skip: posts.length, // Use current posts length as offset to avoid duplicates
        },
      });

      console.log("Load more response:", response.data);

      if (response.data && response.data.issues) {
        const newIssues = await Promise.all(
          response.data.issues.map(async (issue) => ({
            id: issue.issue_id,
            issueTypes: issue.detected_issues,
            location: await formatLocation(issue.location),
            postImage: {
              uri: issue.photo_url,
            },
            impactLevel:
              issue.severity_score > 7
                ? "High"
                : issue.severity_score > 4
                ? "Medium"
                : "Low",
            co2Impact: issue.co2Impact,
            likes: issue.upvotes?.open || 0,
            status: issue.status,
            description: issue.description,
            createdAt: issue.created_at,
            severityScore: issue.severity_score,
            distanceKm: issue.distance_km,
            detailedData: issue,
          }))
        );

        console.log(
          `Loaded ${newIssues.length} new issues. Total in backend: ${
            response.data.total || "unknown"
          }, Current skip: ${response.data.skip || 0}`
        );

        if (newIssues.length === 0) {
          setHasMore(false);
        } else {
          // Filter out duplicates by checking if issue ID already exists
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const uniqueNewIssues = newIssues.filter(
              (issue) => !existingIds.has(issue.id)
            );

            // If no new unique issues, we've reached the end
            if (uniqueNewIssues.length === 0) {
              setHasMore(false);
              return prev;
            }

            const newTotal = prev.length + uniqueNewIssues.length;
            // Check if we've loaded all available issues
            if (response.data.total && newTotal >= response.data.total) {
              setHasMore(false);
            }

            return [...prev, ...uniqueNewIssues];
          });
          setPage(nextPage);
        }
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error("Error loading more posts:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Like functionality is now handled within SocialPost component

  const formatLocation = async (location) => {
    if (!location) return "Unknown location";
    try {
      const addressParts = await Location.reverseGeocodeAsync({
        latitude: location.lat,
        longitude: location.lon,
      });
      console.log(
        "Reverse geocode result for location:",
        location,
        addressParts
      );
      if (addressParts.length > 0) {
        const { name, street } = addressParts[0];
        return [name, street].filter(Boolean).join(", ");
      }
    } catch (e) {
      console.log("Error formatting location:", e);
    }
    return "Unknown location";
  };

  const getPosts = async () => {
    if (!lastLocation || !lastLocation.coords) {
      setPosts([]);
      return;
    }
    console.log("Fetching posts for location:", lastLocation);

    try {
      // Reset pagination state when fetching initial posts
      setPage(1);
      setHasMore(true);

      const response = await api.get("/issues/", {
        params: {
          latitude: lastLocation.coords.latitude,
          longitude: lastLocation.coords.longitude,
          limit: 20,
        },
      });
      console.log("API Response:", response.data);

      if (!response.data || !response.data.issues) {
        console.error("API Response missing issues data:", response.data);
        setPosts([]);
        return;
      }

      const issues = await Promise.all(
        response.data.issues.map(async (issue) => ({
          id: issue.issue_id,
          issueTypes: issue.detected_issues,
          location: await formatLocation(issue.location),
          postImage: {
            uri: issue.photo_url,
          },
          impactLevel:
            issue.severity_score > 7
              ? "High"
              : issue.severity_score > 4
              ? "Medium"
              : "Low",
          co2Impact: issue.co2Impact,
          likes: issue.upvotes?.open || 0,
          status: issue.status,
          description: issue.description,
          createdAt: issue.created_at,
          severityScore: issue.severity_score,
          distanceKm: issue.distance_km,
          detailedData: issue,
        }))
      );

      issues.sort((a, b) => b.severityScore - a.severityScore);

      console.log("Fetched Issues", issues);
      setPosts(issues);

      if (issues.length === 0) {
        console.log("No issues found for this location");
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
      console.error("Error details:", {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      setPosts([]);
    }
  };

  const handleFixToggle = (postId) => {
    setPosts(
      posts.map((post) =>
        post.id === postId
          ? {
              ...post,
              status: post.status === "resolved" ? "unresolved" : "resolved",
            }
          : post
      )
    );
  };

  const handleSameIssue = (postId) => {
    console.log(`Same issue elsewhere for post ${postId}`);
  };

  const handlePostPress = (post) => {
    setSelectedIssue(post);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedIssue(null);
  };

  const handleUploadFix = (post) => {
    // Navigate to FixUploadScreen with issue data
    navigation.navigate("FixUpload", {
      issueId: post.id,
      issueData: post,
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // getPosts will reset pagination state internally
    await getPosts();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      {/* Filter Button */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFiltersVisible(true)}
        >
          <Text style={styles.filterButtonText}>Filters</Text>
        </TouchableOpacity>
        <Text style={styles.filterSummary}>
          {getFilteredPosts().length} of {posts.length} issues
        </Text>
      </View>

      <FlatList
        data={getFilteredPosts()}
        renderItem={({ item }) => (
          <SocialPost
            postId={item.id}
            issueTypes={item.issueTypes}
            location={item.location}
            postImage={item.postImage}
            impactLevel={item.impactLevel}
            co2Impact={item.co2Impact}
            likes={item.likes}
            status={item.status}
            description={item.description}
            createdAt={item.createdAt}
            severityScore={item.severityScore}
            distanceKm={item.distanceKm}
            detailedData={item.detailedData}
            userType={userType}
            onFixToggle={() => handleFixToggle(item.id)}
            onSameIssue={() => handleSameIssue(item.id)}
            onPress={() => handlePostPress(item)}
            onUploadFix={() => handleUploadFix(item)}
          />
        )}
        keyExtractor={(item) => item.id.toString()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4285f4"
            colors={["#4285f4"]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingFooter}>
              <ActivityIndicator size="large" color="#4285f4" />
              <Text style={styles.loadingText}>Loading more issues...</Text>
            </View>
          ) : !hasMore && posts.length > 0 ? (
            <View style={styles.endFooter}>
              <Text style={styles.endText}>No more issues to load</Text>
            </View>
          ) : null
        }
      />

      {/* Filter Modal */}
      <Modal
        visible={filtersVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFiltersVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.filterModal}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filters</Text>
              <TouchableOpacity
                onPress={() => setFiltersVisible(false)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterContent}>
              {/* Status Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Status</Text>
                <View style={styles.filterOptions}>
                  {["all", "open", "closed"].map((status) => (
                    <TouchableOpacity
                      key={status}
                      style={[
                        styles.filterOption,
                        filters.status === status &&
                          styles.filterOptionSelected,
                      ]}
                      onPress={() => updateFilter("status", status)}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          filters.status === status &&
                            styles.filterOptionTextSelected,
                        ]}
                      >
                        {status.charAt(0).toUpperCase() + status.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Severity Filter */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Severity</Text>
                <View style={styles.filterOptions}>
                  {["all", "high", "medium", "low"].map((severity) => (
                    <TouchableOpacity
                      key={severity}
                      style={[
                        styles.filterOption,
                        filters.severity === severity &&
                          styles.filterOptionSelected,
                      ]}
                      onPress={() => updateFilter("severity", severity)}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          filters.severity === severity &&
                            styles.filterOptionTextSelected,
                        ]}
                      >
                        {severity.charAt(0).toUpperCase() + severity.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Sort By */}
              <View style={styles.filterSection}>
                <Text style={styles.filterSectionTitle}>Sort By</Text>
                <View style={styles.filterOptions}>
                  {["severity", "date", "likes"].map((sort) => (
                    <TouchableOpacity
                      key={sort}
                      style={[
                        styles.filterOption,
                        filters.sortBy === sort && styles.filterOptionSelected,
                      ]}
                      onPress={() => updateFilter("sortBy", sort)}
                    >
                      <Text
                        style={[
                          styles.filterOptionText,
                          filters.sortBy === sort &&
                            styles.filterOptionTextSelected,
                        ]}
                      >
                        {sort.charAt(0).toUpperCase() + sort.slice(1)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Action Buttons */}
              <View style={styles.filterActions}>
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={resetFilters}
                >
                  <Text style={styles.resetButtonText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.applyButton}
                  onPress={() => setFiltersVisible(false)}
                >
                  <Text style={styles.applyButtonText}>Apply</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <IssueDetailModal
        visible={modalVisible}
        onClose={handleCloseModal}
        issueData={selectedIssue}
        userType={userType}
        onUploadFix={handleUploadFix}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  listContent: {
    padding: 16,
    // paddingBottom: 100, // Account for bottom tab bar + extra spacing
  },
  filterBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
  },
  filterButton: {
    backgroundColor: "#4285f4",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  filterButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  filterSummary: {
    color: "#666",
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  filterModal: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: 18,
    color: "#666",
    fontWeight: "bold",
  },
  filterContent: {
    padding: 16,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  filterOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  filterOption: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
  },
  filterOptionSelected: {
    backgroundColor: "#4285f4",
  },
  filterOptionText: {
    color: "#666",
    fontSize: 14,
  },
  filterOptionTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  filterActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
  },
  resetButton: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  resetButtonText: {
    color: "#666",
    fontWeight: "600",
  },
  applyButton: {
    backgroundColor: "#4285f4",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  applyButtonText: {
    color: "#fff",
    fontWeight: "600",
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#666",
  },
  endFooter: {
    paddingVertical: 20,
    alignItems: "center",
  },
  endText: {
    fontSize: 14,
    color: "#999",
    fontStyle: "italic",
  },
});

export default HomeScreen;
