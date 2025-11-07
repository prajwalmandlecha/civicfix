import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import SocialPost from "../components/SocialPost";
import IssueDetailModal from "../components/IssueDetailModal";
import FilterModal from "../components/FilterModal";
import api from "../services/api";
import { useUserContext } from "../context/UserContext";
import * as Location from "expo-location";
import { getCurrentLocation } from "../services/getLocation";

const HomeScreen = ({ navigation }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [posts, setPosts] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [filters, setFilters] = useState({
    status: "open",
    severity: "all",
    sortBy: "severity",
    days: 30,
    radiusKm: 5,
    issueTypes: [],
    limit: 20,
  });
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const {
    lastLocation,
    userType,
    updateLastLocation,
    loading: contextLoading,
  } = useUserContext();

  useEffect(() => {
    if (!contextLoading) {
      getPosts();
    }
  }, [lastLocation, filters, contextLoading]);

  const getFilteredPosts = () => {
    let result = [...posts];

    // Filter by status
    if (filters.status !== "all") {
      result = result.filter(
        (post) => post.status?.toLowerCase() === filters.status
      );
    }

    // Filter by severity
    if (filters.severity !== "all") {
      result = result.filter((post) => {
        switch (filters.severity) {
          case "high":
            return post.severityScore >= 8;
          case "medium":
            return post.severityScore >= 4 && post.severityScore < 8;
          case "low":
            return post.severityScore < 4;
          default:
            return true;
        }
      });
    }

    // Filter by issue types (intersection)
    if (filters.issueTypes && filters.issueTypes.length > 0) {
      const selectedSet = new Set(
        filters.issueTypes.map((t) => String(t).toUpperCase())
      );
      result = result.filter((post) => {
        const types = (post.issueTypes || []).map((t) =>
          typeof t === "string"
            ? t.toUpperCase()
            : String(t?.type || t?.name || t).toUpperCase()
        );
        return types.some((t) => selectedSet.has(t));
      });
    }

    // Sort posts
    result.sort((a, b) => {
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

    return result;
  };

  const filteredPosts = getFilteredPosts();

  // Filter handlers - React Compiler will optimize
  const handleApplyFilters = (newFilters) => {
    setRefreshing(true);
    setFilters(newFilters);
    setFiltersVisible(false);
  };

  const handleResetFilters = (resetFilters) => {
    setFilters(resetFilters);
  };

  const handleLoadMore = async () => {
    if (loadingMore || !hasMore || !lastLocation?.coords) return;

    console.log(
      `Loading more issues... Current posts: ${posts.length}, Page: ${page}`
    );
    setLoadingMore(true);
    const nextPage = page + 1;

    try {
      // NEW: Use the combined endpoint that includes user status
      const response = await api.get("/api/issues/with-user-status", {
        params: {
          latitude: lastLocation.coords.latitude,
          longitude: lastLocation.coords.longitude,
          limit: filters.limit,
          skip: posts.length, // Use current posts length as offset to avoid duplicates
          radius_km: filters.radiusKm,
          days_back: filters.days,
        },
      });

      console.log("Load more response:", response.data);

      if (response.data && response.data.issues) {
        const newIssues = await Promise.all(
          response.data.issues.map(async (issue) => {
            // Show correct upvote count based on issue status
            const isClosed = issue.status?.toLowerCase() === "closed";
            const upvoteCount = isClosed
              ? issue.upvotes?.closed || 0
              : issue.upvotes?.open || 0;

            return {
              id: issue.issue_id,
              issueTypes: issue.detected_issues,
              location: await formatLocation(issue.location),
              postImage: {
                uri: issue.photo_url,
              },
              impactLevel:
                issue.severity_score >= 8
                  ? "High"
                  : issue.severity_score >= 4
                    ? "Medium"
                    : "Low",
              co2Impact: issue.co2Impact,
              likes: upvoteCount,
              status: issue.status,
              description: issue.description,
              createdAt: issue.created_at,
              severityScore: issue.severity_score,
              distanceKm: issue.distance_km,
              detailedData: issue,
              // NEW: User status is already included in the response!
              userStatus: issue.userStatus || {
                hasUpvoted: false,
                hasReported: false,
              },
            };
          })
        );

        console.log(
          `Loaded ${newIssues.length
          } new issues with user status. Total in backend: ${response.data.total || "unknown"
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

          // NO LONGER NEEDED: Batch fetch upvote/report status
          // The status is already included in the response from /api/issues/with-user-status
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

  // Location formatting with caching
  const locationCache = React.useRef(new Map());

  const formatLocation = async (location) => {
    if (!location) return "Unknown location";

    const lat =
      typeof location.lat === "number"
        ? location.lat
        : typeof location.latitude === "number"
          ? location.latitude
          : undefined;
    const lon =
      typeof location.lon === "number"
        ? location.lon
        : typeof location.longitude === "number"
          ? location.longitude
          : undefined;

    if (typeof lat !== "number" || typeof lon !== "number") {
      return "Unknown location";
    }

    // Check cache first
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (locationCache.current.has(cacheKey)) {
      return locationCache.current.get(cacheKey);
    }

    try {
      const addressParts = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lon,
      });

      if (addressParts.length > 0) {
        const { name, street } = addressParts[0];
        const formatted = [name, street].filter(Boolean).join(", ");

        // Cache the result
        locationCache.current.set(cacheKey, formatted);
        return formatted;
      }
    } catch (e) {
      console.log("Error formatting location:", e);
    }

    return "Unknown location";
  };

  const getPosts = async (forceRefresh = false) => {
    if (!forceRefresh && contextLoading) {
      console.log("Context still loading, skipping posts fetch");
      return;
    }

    if (!lastLocation || !lastLocation.coords) {
      console.log("No location available, cannot fetch posts");
      setPosts([]);
      return;
    }
    console.log("Fetching posts for location:", lastLocation);

    try {
      // Reset pagination state when fetching initial posts
      setPage(1);
      setHasMore(true);

      // NEW: Use the combined endpoint that includes user status
      const response = await api.get("/api/issues/with-user-status", {
        params: {
          latitude: lastLocation.coords.latitude,
          longitude: lastLocation.coords.longitude,
          limit: filters.limit,
          radius_km: filters.radiusKm,
          days_back: filters.days,
        },
      });
      console.log("API Response:", response.data);

      if (!response.data || !response.data.issues) {
        console.error("API Response missing issues data:", response.data);
        setPosts([]);
        return;
      }

      const issues = await Promise.all(
        response.data.issues.map(async (issue) => {
          // Show correct upvote count based on issue status
          const isClosed = issue.status?.toLowerCase() === "closed";
          const upvoteCount = isClosed
            ? issue.upvotes?.closed || 0
            : issue.upvotes?.open || 0;

          return {
            id: issue.issue_id,
            issueTypes: issue.detected_issues,
            location: await formatLocation(issue.location),
            postImage: {
              uri: issue.photo_url,
            },
            impactLevel:
              issue.severity_score >= 8
                ? "High"
                : issue.severity_score >= 4
                  ? "Medium"
                  : "Low",
            co2Impact: issue.co2Impact,
            likes: upvoteCount,
            status: issue.status,
            description: issue.description,
            createdAt: issue.created_at,
            severityScore: issue.severity_score,
            distanceKm: issue.distance_km,
            detailedData: issue,
            // NEW: User status is already included in the response!
            userStatus: issue.userStatus || {
              hasUpvoted: false,
              hasReported: false,
            },
          };
        })
      );

      issues.sort((a, b) => b.severityScore - a.severityScore);

      console.log("Fetched Issues with user status:", issues);
      console.log("First issue userStatus:", issues[0]?.userStatus);
      setPosts(issues);

      // NO LONGER NEEDED: Batch fetch upvote/report status
      // The status is already included in the response from /api/issues/with-user-status

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

  // Event handlers - React Compiler will optimize
  const handlePostPress = (post) => {
    setSelectedIssue(post);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedIssue(null);
  };

  const handleUploadFix = (post) => {
    navigation.navigate("FixUpload", {
      issueId: post.id,
      issueData: post,
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await getPosts(true); // Force refresh, ignore context loading
    } finally {
      setRefreshing(false);
    }
  };

  const handleSetLocation = async () => {
    try {
      setLoadingLocation(true);
      const { addressParts, location, error } = await getCurrentLocation(
        setLoadingLocation
      );
      if (error) {
        Alert.alert(
          "Location Error",
          "Unable to get your location. Please check your location settings."
        );
        return;
      }
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

        const locationData = {
          coords: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          },
          address: formattedAddress,
        };

        await updateLastLocation(locationData);
        Alert.alert("Success", "Location updated! Loading nearby issues...");
      }
    } catch (error) {
      console.error("Error setting location:", error);
      Alert.alert(
        "Location Error",
        "Failed to update location. Please check your device settings and try again."
      );
    } finally {
      setLoadingLocation(false);
    }
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
          {filteredPosts.length} of {posts.length} issues
        </Text>
      </View>

      {/* Using built-in RefreshControl spinner instead of custom overlay */}

      {/* No Location Empty State */}
      {!contextLoading && (!lastLocation || !lastLocation.coords) && (
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={64} color="#ccc" />
          <Text style={styles.emptyStateTitle}>Location Required</Text>
          <Text style={styles.emptyStateText}>
            We need your location to show nearby civic issues.
          </Text>
          <TouchableOpacity
            style={styles.setLocationButton}
            onPress={handleSetLocation}
            disabled={loadingLocation}
          >
            {loadingLocation ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.setLocationButtonText}>Set My Location</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Loading State */}
      {contextLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4285f4" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      )}

      {/* Issues List */}
      {!contextLoading && lastLocation && lastLocation.coords && (
        <FlatList
          data={filteredPosts}
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
              userStatus={item.userStatus}
              onPress={() => handlePostPress(item)}
              onUploadFix={() => handleUploadFix(item)}
            />
          )}
          keyExtractor={(item) => item.id.toString()}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          // Performance optimizations
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          updateCellsBatchingPeriod={50}
          initialNumToRender={5}
          windowSize={5}
          // Refresh
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#4285f4"
              colors={["#4285f4"]}
            />
          }
          // Pagination
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
          ListEmptyComponent={
            !refreshing && (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={64} color="#ccc" />
                <Text style={styles.emptyStateTitle}>No Issues Found</Text>
                <Text style={styles.emptyStateText}>
                  Try adjusting your filters or check back later
                </Text>
              </View>
            )
          }
        />
      )}

      {/* Filter Modal - Using reusable component */}
      <FilterModal
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
        filters={filters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        showRadiusFilter={true}
        showLimitFilter={true}
      />

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
    height: "80%",
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
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
    paddingHorizontal: 16,
    paddingTop: 16,
    flex: 1,
  },
  filterContentContainer: {
    paddingBottom: 12,
  },
  filterSection: {
    marginBottom: 16,
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
    marginTop: 12,
    marginBottom: 8,
  },
  filterFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#e1e5e9",
    backgroundColor: "#fff",
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
  // Searchable types list
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e1e5e9",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#333",
  },
  clearBtn: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f0f0f0",
  },
  clearBtnText: {
    color: "#666",
    fontWeight: "600",
  },
  selectedSummaryRow: {
    marginBottom: 8,
  },
  selectedSummaryText: {
    fontSize: 12,
    color: "#666",
  },
  optionListBox: {
    borderWidth: 1,
    borderColor: "#e1e5e9",
    borderRadius: 12,
    maxHeight: 200,
    overflow: "hidden",
  },
  optionRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  optionRowSelected: {
    backgroundColor: "#eef6ff",
  },
  optionRowText: {
    color: "#333",
    fontSize: 14,
  },
  loadingFooter: {
    paddingVertical: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
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
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#333",
    marginBottom: 12,
    textAlign: "center",
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
  },
  setLocationButton: {
    backgroundColor: "#4285f4",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 25,
    minWidth: 200,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  setLocationButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});

export default HomeScreen;
