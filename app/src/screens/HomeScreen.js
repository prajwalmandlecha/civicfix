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
import { useFocusEffect } from "@react-navigation/native";
import SocialPost from "../components/SocialPost";
import IssueDetailModal from "../components/IssueDetailModal";
import FilterModal from "../components/FilterModal";
import api from "../services/api";
import { useUserContext } from "../context/UserContext";
import * as Location from "expo-location";
import { getCurrentLocation } from "../services/getLocation";
import { showSuccess, showError, showInfo } from "../utils/notify";

const HomeScreen = ({ navigation, route }) => {
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
    myIssues: "all",
  });
  const [loadingLocation, setLoadingLocation] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Dynamic expansion state for load more
  const [expandedParams, setExpandedParams] = useState({
    radiusKm: 5,
    days: 30,
    limit: 20,
  });

  const {
    lastLocation,
    userType,
    updateLastLocation,
    loading: contextLoading,
    profile,
    user, // Add user to get uid
  } = useUserContext();

  // Debug: Log userType changes
  useEffect(() => {
    console.log("[HomeScreen] UserContext updated:", {
      userType,
      hasProfile: !!profile,
      profileUserType: profile?.userType,
      loading: contextLoading,
    });
  }, [userType, profile, contextLoading]);

  // Handle marking issues as fixedByMe/uploadedByMe when returning from upload screens
  useFocusEffect(
    React.useCallback(() => {
      const fixedIssueId = route.params?.fixedIssueId;
      const uploadedIssueId = route.params?.uploadedIssueId;

      if (fixedIssueId) {
        console.log("[HomeScreen] Marking issue as fixedByMe:", fixedIssueId);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === fixedIssueId
              ? {
                ...p,
                userStatus: {
                  ...(p.userStatus || {}),
                  fixedByMe: true,
                },
              }
              : p
          )
        );
        // Clear param
        navigation.setParams({ fixedIssueId: undefined });
      }

      if (uploadedIssueId) {
        console.log("[HomeScreen] Marking issue as uploadedByMe:", uploadedIssueId);
        setPosts((prev) =>
          prev.map((p) =>
            p.id === uploadedIssueId
              ? {
                ...p,
                userStatus: {
                  ...(p.userStatus || {}),
                  hasReported: true,
                  uploadedByMe: true,
                },
              }
              : p
          )
        );
        // Clear param
        navigation.setParams({ uploadedIssueId: undefined });
      }
    }, [route.params?.fixedIssueId, route.params?.uploadedIssueId, navigation])
  );

  // Fallback once flag to avoid repeated navigation
  const hasAppliedLocationFallback = React.useRef(false);

  // Initial data fetch when context is ready
  useEffect(() => {
    if (!contextLoading) {
      getPosts();
    }
  }, [contextLoading]);

  // Reset and fetch when filters change
  useEffect(() => {
    if (!contextLoading) {
      setExpandedParams({
        radiusKm: filters.radiusKm,
        days: filters.days,
        limit: filters.limit,
      });
      setHasMore(true);
      getPosts();
    }
  }, [filters]);

  // If device location isn't available, fall back to user's saved profile location and open map
  useEffect(() => {
    if (contextLoading) return;
    if (hasAppliedLocationFallback.current) return;

    const profileLoc = profile?.lastLocation;
    if ((!lastLocation || !lastLocation?.coords) && profileLoc?.coords) {
      hasAppliedLocationFallback.current = true;
      // Apply saved profile location as current app location
      updateLastLocation(profileLoc);
      // Navigate user to the Location tab centered on their saved location
      navigation.navigate("Location");
    }
  }, [contextLoading, lastLocation?.coords, profile?.lastLocation]);

  const getFilteredPosts = () => {
    let result = [...posts];

    const currentUid = user?.uid; // Get uid from user object

    console.log("[getFilteredPosts] START", {
      totalPosts: posts.length,
      myIssuesFilter: filters.myIssues,
      currentUid: currentUid,
      hasUser: !!user,
      hasProfile: !!profile,
    });

    // Exclude anonymous posts globally
    const beforeAnon = result.length;
    result = result.filter(
      (post) => post?.detailedData?.reported_by && post.detailedData.reported_by !== "anonymous"
    );
    if (beforeAnon !== result.length) {
      console.log("[Filter Debug] Excluded anonymous posts:", beforeAnon - result.length);
    }

    // Filter by My Issues (uploaded/fixed by current user)
    if (filters.myIssues !== "all" && currentUid) {
      console.log("[getFilteredPosts] Entering myIssues filter branch");
      result = result.filter((post) => {
        const reporterId = post.detailedData?.reported_by;
        const closedBy = post.detailedData?.closed_by;
        const userStatus = post.userStatus || {};

        console.log("[MyIssues Filter] Post debug", {
          postId: post.id,
          filter: filters.myIssues,
          currentUid: currentUid,
          reported_by: reporterId,
          closed_by: closedBy,
          userStatus,
        });

        if (filters.myIssues === "uploaded") {
          // Uploaded by me: ES field or userStatus flag
          const hasReported = userStatus.hasReported === true;
          const match = (reporterId && reporterId === currentUid) || hasReported;
          console.log("[MyIssues Filter] Uploaded check", {
            postId: post.id,
            reporterId,
            hasReported,
            match,
          });
          return match;
        } else if (filters.myIssues === "fixed") {
          // Fixed by me: match closed_by to NGO uid OR fixedByMe flag
          const hasFixed = userStatus.hasFixed === true || userStatus.fixedByMe === true;
          const match = (closedBy && closedBy === currentUid) || hasFixed;
          console.log("[MyIssues Filter] Fixed check", {
            postId: post.id,
            closedBy,
            hasFixed,
            match,
          });
          return match;
        }
        return true;
      });

      console.log("[Filter Debug] After myIssues filter, results:", result.length);
    }

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

    // Sort posts - REMOVED liked posts prioritization
    result.sort((a, b) => {
      switch (filters.sortBy) {
        case "date":
          return new Date(b.createdAt) - new Date(a.createdAt);
        case "likes":
          return b.likes - a.likes;
        case "severity":
        default:
          // Sort by severity score (most relevant issues first)
          return b.severityScore - a.severityScore;
      }
    });

    return result;
  };

  const filteredPosts = getFilteredPosts();

  // Filter handlers - React Compiler will optimize
  const handleApplyFilters = (newFilters) => {
    console.log("[HomeScreen] Applying new filters:", newFilters);
    setFilters(newFilters);
    setFiltersVisible(false);
  };

  const handleResetFilters = (resetFilters) => {
    console.log("[HomeScreen] Resetting filters:", resetFilters);
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
      // First try to load more with current parameters
      const response = await api.get("/api/issues/with-user-status", {
        params: {
          latitude: lastLocation.coords.latitude,
          longitude: lastLocation.coords.longitude,
          limit: expandedParams.limit,
          skip: posts.length,
          radius_km: expandedParams.radiusKm,
          days_back: expandedParams.days,
        },
      });

      console.log("Load more response:", response.data);

      if (response.data && response.data.issues) {
        const newIssues = await Promise.all(
          response.data.issues.map(async (issue) => {
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
              userStatus: issue.userStatus || {
                hasUpvoted: false,
                hasReported: false,
              },
            };
          })
        );

        console.log(
          `Loaded ${newIssues.length} new issues. Total in backend: ${response.data.total || "unknown"
          }`
        );

        if (newIssues.length === 0) {
          // No more issues with current parameters
          if (filters.myIssues === "fixed") {
            // Do not expand when filtering by 'Fixed by Me'
            console.log(
              "No new issues found and 'Fixed by Me' active — not expanding search."
            );
            setHasMore(false);
          } else {
            console.log(
              "No new issues found, attempting to expand search parameters..."
            );

            // Expand search parameters progressively
            const newExpandedParams = { ...expandedParams };
            let expanded = false;

            // Priority: radius > days > limit
            if (expandedParams.radiusKm < 50) {
              newExpandedParams.radiusKm = Math.min(
                expandedParams.radiusKm + 5,
                50
              );
              expanded = true;
              console.log(`Expanding radius to ${newExpandedParams.radiusKm}km`);
            } else if (expandedParams.days < 180) {
              newExpandedParams.days = Math.min(
                expandedParams.days + 30,
                180
              );
              expanded = true;
              console.log(`Expanding days to ${newExpandedParams.days} days`);
            } else if (expandedParams.limit < 100) {
              newExpandedParams.limit = Math.min(
                expandedParams.limit + 20,
                100
              );
              expanded = true;
              console.log(`Expanding limit to ${newExpandedParams.limit}`);
            }

            if (expanded) {
              setExpandedParams(newExpandedParams);
              setHasMore(true); // Re-enable loading more
              showInfo(`Expanding search to ${newExpandedParams.radiusKm}km radius`);
            } else {
              // Reached maximum expansion
              setHasMore(false);
              console.log("Reached maximum search parameters");
            }
          }
        } else {
          // Filter out duplicates
          setPosts((prev) => {
            const existingIds = new Set(prev.map((p) => p.id));
            const uniqueNewIssues = newIssues.filter(
              (issue) => !existingIds.has(issue.id)
            );

            if (uniqueNewIssues.length === 0) {
              // All issues were duplicates - try expanding
              console.log("All issues were duplicates, will expand on next load");
              setHasMore(true);
              return prev;
            }

            const newTotal = prev.length + uniqueNewIssues.length;
            if (response.data.total && newTotal >= response.data.total) {
              // Loaded all available issues for current params
              setHasMore(true); // Keep trying with expanded params
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
      setHasMore(false);
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

      setPosts(issues);

      if (issues.length === 0) {
        console.log("No issues found for this location");
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
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

  const handleUpvoteCallback = (postId, result) => {
    if (result.ok) {
      // Update the posts array to reflect the new upvote status
      setPosts((prevPosts) =>
        prevPosts.map((post) => {
          if (post.id === postId) {
            // Calculate new like count based on status
            const isClosed = post.status?.toLowerCase() === "closed";
            const newLikes = result.upvotes
              ? isClosed
                ? result.upvotes.closed || 0
                : result.upvotes.open || 0
              : post.likes;

            return {
              ...post,
              likes: newLikes, // Update the displayed like count
              userStatus: {
                ...post.userStatus,
                hasUpvoted: result.isActive,
              },
            };
          }
          return post;
        })
      );
    }
  };

  const handleReportCallback = (postId, result) => {
    if (result.ok) {
      // Update the posts array to reflect the new report status
      setPosts((prevPosts) =>
        prevPosts.map((post) => {
          if (post.id === postId) {
            return {
              ...post,
              userStatus: {
                ...post.userStatus,
                hasReported: result.hasReported || true,
              },
            };
          }
          return post;
        })
      );
    }
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
      const result = await getCurrentLocation(setLoadingLocation);

      if (!result || result.error) {
        let errorMessage = "Unable to get your location. Please check your location settings.";
        if (result?.error === "permission_denied") {
          errorMessage = "Location permission denied. Please enable it in your device settings to use this feature.";
        } else if (result?.error === "services_disabled") {
          errorMessage = "Location services are disabled. Please enable them in your device settings.";
        }
        Alert.alert("Location Error", errorMessage);
        return;
      }

      const { addressParts, location } = result;

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
        showSuccess("Location updated! Loading nearby issues...");
      }
    } catch (error) {
      console.error("Error setting location:", error);
      showError(
        "Failed to update location. Please check your device settings and try again.",
        "Location Error"
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

      {/* No Location Inline Prompt */}
      {!contextLoading && (!lastLocation || !lastLocation.coords) && (
        <View style={styles.emptyState}>
          <Ionicons name="location-outline" size={72} color="#4285f4" />
          <Text style={styles.emptyStateTitle}>Welcome to CivicFix!</Text>
          <Text style={styles.emptyStateText}>
            To get started, we need your location to show you nearby civic issues in your community.
          </Text>

          {/* Primary action: Try to fetch device location */}
          <TouchableOpacity
            style={[styles.setLocationButton, styles.primaryButton]}
            onPress={handleSetLocation}
            disabled={loadingLocation}
          >
            {loadingLocation ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="locate" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.setLocationButtonText}>Enable Location</Text>
              </>
            )}
          </TouchableOpacity>

          {/* Alternative: Browse the map */}
          <TouchableOpacity
            style={[styles.setLocationButton, styles.secondaryButton]}
            onPress={() => navigation.navigate("Location")}
          >
            <Ionicons name="map-outline" size={20} color="#4285f4" style={{ marginRight: 8 }} />
            <Text style={styles.secondaryButtonText}>Browse Map Instead</Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>
            You can change your location anytime from your profile or the map screen.
          </Text>
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
              onUpvote={handleUpvoteCallback}
              onReport={handleReportCallback}
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
                <Text style={styles.endText}>
                  Showing all available issues within {expandedParams.radiusKm}km
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !refreshing && !contextLoading && !loadingMore && (
              <View style={{ paddingVertical: 40, alignItems: "center", paddingHorizontal: 40 }}>
                <Ionicons name="search-outline" size={48} color="#999" />
                <Text style={{ marginTop: 16, color: "#333", fontSize: 16, fontWeight: "600", textAlign: "center" }}>
                  No issues found
                </Text>
                <Text style={{ marginTop: 8, color: "#666", textAlign: "center", lineHeight: 20 }}>
                  {filters.myIssues === "fixed"
                    ? "You haven't fixed any issues yet. Upload a fix for an open issue to see it here."
                    : filters.myIssues === "uploaded"
                      ? "You haven't uploaded any issues yet. Report a new issue to see it here."
                      : "Try adjusting your filters or expanding the search area."}
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
        userType={userType}
      />

      <IssueDetailModal
        visible={modalVisible}
        onClose={handleCloseModal}
        issueData={selectedIssue}
        userType={userType}
        onUploadFix={handleUploadFix}
        onUpvote={handleUpvoteCallback}
        onReport={handleReportCallback}
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
    backgroundColor: "#f8f9fa",
  },
  emptyStateIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1a1a1a",
    marginTop: 24,
    marginBottom: 12,
    textAlign: "center",
  },
  emptyStateText: {
    fontSize: 16,
    color: "#666",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 24,
    maxWidth: 320,
  },
  setLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 260,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  primaryButton: {
    backgroundColor: "#4285f4",
  },
  secondaryButton: {
    backgroundColor: "#fff",
    borderWidth: 2,
    borderColor: "#4285f4",
    shadowOpacity: 0.05,
  },
  setLocationButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  secondaryButtonText: {
    color: "#4285f4",
    fontSize: 16,
    fontWeight: "700",
  },
  helperText: {
    fontSize: 13,
    color: "#999",
    textAlign: "center",
    marginTop: 24,
    fontStyle: "italic",
    maxWidth: 280,
  },
});

export default HomeScreen;
