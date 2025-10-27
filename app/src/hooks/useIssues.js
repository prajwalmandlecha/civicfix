import { useState, useEffect, useCallback } from "react";
import { fetchIssuesWithUserStatus } from "../api/endpoints/issues.api";
import { PAGINATION_CONFIG } from "../constants/config";
import * as Location from "expo-location";

/**
 * Custom hook for managing issues data (fetching, filtering, sorting, pagination)
 * @param {Object} location - User location {coords: {latitude, longitude}}
 * @returns {Object} Issues data and utilities
 */
export const useIssues = (location) => {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filters, setFilters] = useState({
    status: "open",
    severity: "all",
    sortBy: "severity",
  });

  /**
   * Format location from coordinates to readable address
   */
  const formatLocation = async (loc) => {
    if (!loc) return "Unknown location";
    try {
      const addressParts = await Location.reverseGeocodeAsync({
        latitude: loc.lat,
        longitude: loc.lon,
      });
      if (addressParts.length > 0) {
        const { name, street } = addressParts[0];
        return [name, street].filter(Boolean).join(", ");
      }
    } catch (e) {
      console.error("Error formatting location:", e);
    }
    return "Unknown location";
  };

  /**
   * Transform API issue to app format
   */
  const transformIssue = async (issue) => {
    const isClosed = issue.status?.toLowerCase() === "closed";
    const upvoteCount = isClosed
      ? issue.upvotes?.closed || 0
      : issue.upvotes?.open || 0;

    return {
      id: issue.issue_id,
      issueTypes: issue.detected_issues,
      location: await formatLocation(issue.location),
      postImage: { uri: issue.photo_url },
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
  };

  /**
   * Fetch issues from API
   */
  const fetchIssues = useCallback(
    async (skipCount = 0) => {
      if (!location?.coords) {
        console.log("No location available");
        return [];
      }

      try {
        const response = await fetchIssuesWithUserStatus({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          limit: PAGINATION_CONFIG.DEFAULT_LIMIT,
          skip: skipCount,
        });

        if (!response.data?.issues) {
          return [];
        }

        const transformedIssues = await Promise.all(
          response.data.issues.map(transformIssue)
        );

        return transformedIssues;
      } catch (error) {
        console.error("Error fetching issues:", error);
        return [];
      }
    },
    [location]
  );

  /**
   * Load initial issues
   */
  const loadIssues = async () => {
    setLoading(true);
    setPage(1);
    setHasMore(true);

    const newIssues = await fetchIssues(0);
    setIssues(newIssues);
    setLoading(false);

    if (newIssues.length === 0) {
      setHasMore(false);
    }
  };

  /**
   * Load more issues (pagination)
   */
  const loadMore = async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    const newIssues = await fetchIssues(issues.length);

    if (newIssues.length === 0) {
      setHasMore(false);
    } else {
      setIssues((prev) => [...prev, ...newIssues]);
      setPage((prev) => prev + 1);
    }

    setLoadingMore(false);
  };

  /**
   * Refresh issues
   */
  const refresh = async () => {
    setRefreshing(true);
    await loadIssues();
    setRefreshing(false);
  };

  /**
   * Apply filters to issues
   */
  const getFilteredIssues = () => {
    let filtered = [...issues];

    // Filter by status
    if (filters.status !== "all") {
      filtered = filtered.filter(
        (issue) => issue.status?.toLowerCase() === filters.status
      );
    }

    // Filter by severity
    if (filters.severity !== "all") {
      filtered = filtered.filter((issue) => {
        switch (filters.severity) {
          case "high":
            return issue.severityScore >= 8;
          case "medium":
            return issue.severityScore >= 4 && issue.severityScore < 8;
          case "low":
            return issue.severityScore < 4;
          default:
            return true;
        }
      });
    }

    // Sort issues
    filtered.sort((a, b) => {
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

    return filtered;
  };

  /**
   * Update filter values
   */
  const updateFilter = (filterType, value) => {
    setFilters((prev) => ({ ...prev, [filterType]: value }));
  };

  /**
   * Reset filters
   */
  const resetFilters = () => {
    setFilters({
      status: "open",
      severity: "all",
      sortBy: "severity",
    });
  };

  // Load issues when location changes
  useEffect(() => {
    if (location?.coords) {
      loadIssues();
    }
  }, [location]);

  return {
    issues: getFilteredIssues(),
    rawIssues: issues,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    filters,
    loadIssues,
    loadMore,
    refresh,
    updateFilter,
    resetFilters,
  };
};

