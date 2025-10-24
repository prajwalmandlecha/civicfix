import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  Alert,
  TouchableOpacity,
  Image,
  ScrollView,
  Switch,
  Modal,
} from "react-native";
import MapView, {
  Marker,
  Heatmap,
  PROVIDER_GOOGLE,
  Callout,
} from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useUserContext } from "../context/UserContext";
import api from "../services/api";
import { getIssueDisplayName } from "../utils/issueTypeMapping";

const getSeverityColor = (severityScore) => {
  if (severityScore >= 8) return "#991B1B"; // Dark red - High (8-10)
  if (severityScore >= 4) return "#F97316"; // Orange - Medium (4-7.9)
  return "#22C55E"; // Green - Low (0-3.9)
};

const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case "closed":
      return "#22C55E"; // Green
    case "open":
      return "#F97316"; // Orange
    default:
      return "#9CA3AF"; // Gray
  }
};

const getMarkerColor = (issue) => {
  // For fixed (closed) issues, use the green color used throughout the app
  if (issue.status?.toLowerCase() === "closed") {
    return "#4CAF79"; // Green color used for fixed issues
  }
  // For open issues, color based on severity score
  const severityScore = issue.severity_score || 5;
  return getSeverityColor(severityScore);
};

// Custom Marker Component
const CustomMarker = ({ issue }) => {
  const color = getMarkerColor(issue);
  const displayValue =
    issue.status?.toLowerCase() === "closed"
      ? "✓"
      : Math.round(issue.severity_score || 5);
  return (
    <View style={styles.customMarker}>
      <View style={[styles.markerInner, { backgroundColor: color }]}>
        <Text style={styles.markerText}>{displayValue}</Text>
      </View>
      <View style={[styles.markerArrow, { borderTopColor: color }]} />
    </View>
  );
};

const MapScreen = ({ navigation }) => {
  const mapRef = useRef(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(13);
  const [locationError, setLocationError] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [fixDetails, setFixDetails] = useState(null);
  const [loadingFix, setLoadingFix] = useState(false);
  const [filters, setFilters] = useState({
    status: "open", // all, open, closed (default to open)
    severity: "all", // all, high, medium, low
    sortBy: "severity", // severity, date, distance
  });
  const [region, setRegion] = useState({
    latitude: 12.9716,
    longitude: 77.5946,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  const { userType } = useUserContext();

  const displayIssues = React.useMemo(() => {
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
        const severity = issue.severity_score || 0;
        switch (filters.severity) {
          case "high":
            return severity >= 8;
          case "medium":
            return severity >= 4 && severity < 8;
          case "low":
            return severity < 4;
          default:
            return true;
        }
      });
    }

    // Sort issues
    filtered.sort((a, b) => {
      switch (filters.sortBy) {
        case "date":
          return new Date(b.created_at) - new Date(a.created_at);
        case "distance":
          return (a.distance_km || 0) - (b.distance_km || 0);
        case "severity":
        default:
          return (b.severity_score || 0) - (a.severity_score || 0);
      }
    });

    return filtered;
  }, [issues, filters]);

  useEffect(() => {
    initializeMap();
  }, []);

  const initializeMap = async () => {
    try {
      setLocationError(false);

      // Request location permissions
      let { status } = await Location.getForegroundPermissionsAsync();

      if (status !== "granted") {
        const { status: newStatus } =
          await Location.requestForegroundPermissionsAsync();
        status = newStatus;
      }

      if (status !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Location permission is required to show nearby issues"
        );
        setLoading(false);
        setLocationError(true);
        return;
      }

      // Check if location services are enabled
      const isLocationEnabled = await Location.hasServicesEnabledAsync();
      if (!isLocationEnabled) {
        Alert.alert(
          "Location Services Disabled",
          "Please enable location services in your device settings to see nearby issues.",
          [
            {
              text: "Cancel",
              onPress: () => {
                setLoading(false);
                setLocationError(true);
              },
              style: "cancel",
            },
            {
              text: "Retry",
              onPress: () => initializeMap(),
            },
          ]
        );
        return;
      }

      // Get current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = location.coords;

      setUserLocation({ latitude, longitude });
      setRegion({
        latitude,
        longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });

      // Fetch issues near user location
      await fetchIssues(latitude, longitude);
    } catch (error) {
      console.error("Error initializing map:", error);

      let errorMessage = "Failed to get your location. ";
      if (error.message.includes("Location request timed out")) {
        errorMessage =
          "Location request timed out. Please check if location services are enabled.";
      } else if (error.message.includes("Location provider is unavailable")) {
        errorMessage =
          "Location services are unavailable. Please enable them in settings.";
      }

      Alert.alert("Location Error", errorMessage, [
        {
          text: "Cancel",
          onPress: () => {
            setLoading(false);
            setLocationError(true);
          },
          style: "cancel",
        },
        {
          text: "Retry",
          onPress: () => initializeMap(),
        },
      ]);
    }
  };

  const fetchIssues = async (latitude, longitude, radiusKm = 10) => {
    try {
      setLoading(true);
      const response = await api.get("/issues/", {
        params: {
          latitude,
          longitude,
          radius_km: radiusKm,
          limit: 50, // Reduced from 100 for better performance
          days_back: 30, // Reduced from 90 for better performance
        },
      });

      if (response.data && response.data.issues) {
        setIssues(response.data.issues);
      }
    } catch (error) {
      console.error("Error fetching issues:", error);
      Alert.alert("Error", "Failed to load issues");
    } finally {
      setLoading(false);
    }
  };

  // Debounce region changes to reduce API calls
  const fetchDebounceRef = useRef(null);
  const lastFetchRegionRef = useRef(null);

  const onRegionChangeComplete = useCallback((newRegion) => {
    // Clear previous timeout
    if (fetchDebounceRef.current) {
      clearTimeout(fetchDebounceRef.current);
    }

    // Debounce API call for 1000ms to reduce glitches
    fetchDebounceRef.current = setTimeout(() => {
      if (newRegion && newRegion.latitude && newRegion.longitude) {
        // Check if region changed significantly (more than 0.01 degrees)
        const lastRegion = lastFetchRegionRef.current;
        if (lastRegion) {
          const latDiff = Math.abs(newRegion.latitude - lastRegion.latitude);
          const lonDiff = Math.abs(newRegion.longitude - lastRegion.longitude);

          // Don't fetch if change is too small
          if (latDiff < 0.01 && lonDiff < 0.01) {
            return;
          }
        }

        lastFetchRegionRef.current = newRegion;

        const radiusKm = Math.max(
          newRegion.latitudeDelta * 111, // approximate km per degree
          newRegion.longitudeDelta * 111
        );

        // Update zoom level based on latitudeDelta
        const estimatedZoom = Math.round(
          Math.log2(360 / newRegion.latitudeDelta)
        );
        setCurrentZoom(estimatedZoom);

        fetchIssues(newRegion.latitude, newRegion.longitude, radiusKm);
      }
    }, 1000);
  }, []);

  const getMarkerTitle = (issue) => {
    const issueTypes = issue.issue_types || issue.detected_issues || [];
    if (issueTypes.length > 0) {
      return issueTypes
        .map((type) => {
          // Extract the type string from various possible formats
          const typeString =
            typeof type === "string"
              ? type
              : type?.type || type?.name || String(type);
          return getIssueDisplayName(typeString);
        })
        .join(", ");
    }
    return "Issue Report";
  };

  const getMarkerDescription = (issue) => {
    const status = issue.status || "unknown";
    const upvotes =
      typeof issue.upvotes === "object"
        ? issue.upvotes.open || 0
        : issue.upvotes || 0;
    const severity = issue.severity_score || "N/A";
    return `${status.toUpperCase()} | Upvotes: ${upvotes} | Severity: ${severity}`;
  };

  const handleMarkerPress = async (issue) => {
    setSelectedIssue(issue);

    // Fetch fix details if issue is closed
    if (issue.status?.toLowerCase() === "closed" && issue.issue_id) {
      setLoadingFix(true);
      try {
        const response = await api.get(
          `/api/issues/${issue.issue_id}/fix-details`
        );
        if (response.data.has_fix) {
          setFixDetails(response.data);
        }
      } catch (error) {
        console.error("Error fetching fix details:", error);
      } finally {
        setLoadingFix(false);
      }
    } else {
      setFixDetails(null);
    }
  };

  const handleUploadFix = (issue) => {
    // Convert issue format to match what FixUploadScreen expects
    const issueData = {
      id: issue.issue_id,
      postImage: issue.photo_url ? { uri: issue.photo_url } : null,
      location: `${issue.location?.lat?.toFixed(
        4
      )}, ${issue.location?.lon?.toFixed(4)}`,
      issueTypes: (issue.issue_types || issue.detected_issues || []).map(
        (type) => ({
          type: type.type || type,
        })
      ),
    };

    navigation.navigate("FixUpload", {
      issueId: issue.issue_id,
      issueData: issueData,
    });
  };

  const updateFilter = (filterType, value) => {
    setFilters((prev) => ({ ...prev, [filterType]: value }));
  };

  const resetFilters = () => {
    setFilters({
      status: "open", // Reset to open (not all)
      severity: "all",
      sortBy: "severity",
    });
  };

  const handleRefresh = useCallback(async () => {
    if (locationError) {
      // Try to reinitialize if there was a location error
      await initializeMap();
    } else if (userLocation) {
      fetchIssues(userLocation.latitude, userLocation.longitude);
    } else if (region) {
      fetchIssues(region.latitude, region.longitude);
    }
  }, [userLocation, region, locationError]);

  const toggleHeatmap = useCallback(() => {
    setShowHeatmap((prev) => !prev);
  }, []);

  const toggleMarkers = useCallback(() => {
    setShowMarkers((prev) => !prev);
  }, []);

  // Memoize heatmap points to prevent recalculation
  const heatmapPoints = React.useMemo(() => {
    return displayIssues
      .filter(
        (issue) => issue.location && issue.location.lat && issue.location.lon
      )
      .map((issue) => ({
        latitude: issue.location.lat,
        longitude: issue.location.lon,
        weight: (issue.severity_score || 5) / 10, // Normalize weight 0-1
      }));
  }, [displayIssues]);

  if (loading && issues.length === 0) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6FCF97" />
        <Text style={styles.loadingText}>
          {locationError
            ? "Waiting for location..."
            : "Loading nearby issues..."}
        </Text>
        {locationError && (
          <TouchableOpacity style={styles.retryButton} onPress={initializeMap}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter Bar - Top */}
      <View style={styles.filterBar}>
        <View style={styles.filterLeft}>
          <Text style={styles.issueCountText}>
            {displayIssues.length} of {issues.length} issues
          </Text>
        </View>

        <View style={styles.filterRight}>
          <TouchableOpacity
            style={styles.filterSettingsBtn}
            onPress={() => setFiltersVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="options" size={18} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterBtn, showHeatmap && styles.filterBtnActive]}
            onPress={toggleHeatmap}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterBtnText,
                showHeatmap && styles.filterBtnTextActive,
              ]}
            >
              Heat
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterBtn, showMarkers && styles.filterBtnActive]}
            onPress={toggleMarkers}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterBtnText,
                showMarkers && styles.filterBtnTextActive,
              ]}
            >
              Pins
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleRefresh}
            activeOpacity={0.7}
          >
            <Text style={styles.refreshBtnText}>↻</Text>
          </TouchableOpacity>
        </View>
      </View>

      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={true}
        showsMyLocationButton={false}
        maxZoomLevel={18}
        minZoomLevel={8}
        loadingEnabled={true}
        loadingIndicatorColor="#6FCF97"
        moveOnMarkerPress={false}
      >
        {/* Heatmap Layer */}
        {showHeatmap && heatmapPoints.length > 0 && (
          <Heatmap
            points={heatmapPoints}
            radius={40}
            opacity={0.7}
            gradient={{
              colors: ["#22C55E", "#F97316", "#EF4444", "#991B1B"],
              startPoints: [0.0, 0.4, 0.8, 1.0],
              colorMapSize: 256,
            }}
          />
        )}

        {/* Individual Issue Markers */}
        {showMarkers &&
          displayIssues.map((issue, index) => {
            if (issue.location && issue.location.lat && issue.location.lon) {
              return (
                <Marker
                  key={issue.issue_id || `issue-${index}`}
                  coordinate={{
                    latitude: issue.location.lat,
                    longitude: issue.location.lon,
                  }}
                  onPress={() => handleMarkerPress(issue)}
                  tracksViewChanges={false}
                >
                  <CustomMarker issue={issue} />
                  <Callout tooltip>
                    <View style={styles.callout}>
                      <Text style={styles.calloutTitle}>
                        {getMarkerTitle(issue)}
                      </Text>
                      <View style={styles.calloutRow}>
                        <View
                          style={[
                            styles.statusDot,
                            { backgroundColor: getStatusColor(issue.status) },
                          ]}
                        />
                        <Text style={styles.calloutDescription}>
                          {issue.status?.toUpperCase() || "UNKNOWN"}
                        </Text>
                      </View>
                      <Text style={styles.calloutSeverity}>
                        Severity: {issue.severity_score || "N/A"}
                      </Text>
                    </View>
                  </Callout>
                </Marker>
              );
            }
            return null;
          })}
      </MapView>

      {loading && issues.length > 0 && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#6FCF97" />
        </View>
      )}

      {/* Filter Modal */}
      <Modal
        visible={filtersVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setFiltersVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.filterModal}>
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Filters</Text>
              <TouchableOpacity
                onPress={() => setFiltersVisible(false)}
                style={styles.filterCloseButton}
              >
                <Text style={styles.filterCloseButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.filterModalContent}>
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
                  {["severity", "date", "distance"].map((sort) => (
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

      {/* Issue Detail Card */}
      {selectedIssue && (
        <View
          style={[
            styles.detailCard,
            selectedIssue.status?.toLowerCase() === "closed" &&
              styles.detailCardClosed,
          ]}
        >
          <ScrollView>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>
                {getMarkerTitle(selectedIssue)}
              </Text>
              <TouchableOpacity
                onPress={() => setSelectedIssue(null)}
                style={styles.closeButton}
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>

            {selectedIssue.photo_url && (
              <Image
                source={{ uri: selectedIssue.photo_url }}
                style={styles.issueImage}
                resizeMode="cover"
              />
            )}

            <View style={styles.detailContent}>
              {/* Status Badge */}
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: getStatusColor(selectedIssue.status),
                  },
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {selectedIssue.status?.toUpperCase() || "UNKNOWN"}
                </Text>
              </View>

              {/* Description or Fix Title/Description */}
              {selectedIssue.status?.toLowerCase() === "closed" &&
              fixDetails ? (
                <View style={styles.fixInfoContainer}>
                  {fixDetails.title && (
                    <View style={styles.fixTitleContainer}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color="#4CAF79"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.fixTitle}>{fixDetails.title}</Text>
                    </View>
                  )}
                  {fixDetails.description && (
                    <View style={styles.fixDescriptionCard}>
                      <Text style={styles.fixDescription}>
                        {fixDetails.description}
                      </Text>
                    </View>
                  )}
                  {loadingFix && (
                    <Text style={styles.loadingText}>
                      Loading fix details...
                    </Text>
                  )}
                </View>
              ) : (
                selectedIssue.description && (
                  <Text style={styles.description}>
                    {selectedIssue.description}
                  </Text>
                )
              )}

              {/* Stats Grid */}
              <View style={styles.statsGrid}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Upvotes</Text>
                  <Text style={styles.statValue}>
                    {typeof selectedIssue.upvotes === "object"
                      ? selectedIssue.upvotes.open || 0
                      : selectedIssue.upvotes || 0}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Severity</Text>
                  <Text style={styles.statValue}>
                    {selectedIssue.severity_score || "N/A"}
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>
                    {selectedIssue.status?.toLowerCase() === "closed"
                      ? "CO₂ Saved"
                      : "CO₂ Risk"}
                  </Text>
                  <Text
                    style={[
                      styles.statValue,
                      selectedIssue.status?.toLowerCase() === "closed" &&
                        styles.co2SavedValue,
                    ]}
                  >
                    {selectedIssue.status?.toLowerCase() === "closed"
                      ? fixDetails?.co2_saved
                        ? Math.round(fixDetails.co2_saved)
                        : selectedIssue.co2_kg_saved || 0
                      : selectedIssue.fate_risk_co2 || 0}{" "}
                    kg
                  </Text>
                </View>
              </View>

              {/* Meta info */}
              <View style={styles.metaInfo}>
                <Text style={styles.metaText}>
                  Date:{" "}
                  {new Date(selectedIssue.created_at).toLocaleDateString()}
                </Text>
                <Text style={styles.metaText}>
                  Source: {selectedIssue.source || "Unknown"}
                </Text>
                {selectedIssue.distance_km !== undefined && (
                  <Text style={styles.metaText}>
                    Distance: {selectedIssue.distance_km.toFixed(2)} km away
                  </Text>
                )}
              </View>

              {/* Action Button for NGOs - ONLY on OPEN issues */}
              {userType === "ngo" &&
                selectedIssue.status?.toLowerCase() === "open" && (
                  <TouchableOpacity
                    style={styles.uploadFixButtonCard}
                    onPress={() => {
                      setSelectedIssue(null);
                      handleUploadFix(selectedIssue);
                    }}
                  >
                    <Ionicons name="construct" size={20} color="#fff" />
                    <Text style={styles.uploadFixButtonText}>Upload Fix</Text>
                  </TouchableOpacity>
                )}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#666",
  },
  retryButton: {
    marginTop: 20,
    backgroundColor: "#4285f4",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
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
  filterLeft: {
    flex: 1,
  },
  issueCountText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
  },
  filterRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterBtn: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  filterBtnActive: {
    backgroundColor: "#6FCF97",
  },
  filterBtnText: {
    fontSize: 13,
    color: "#666",
    fontWeight: "500",
  },
  filterBtnTextActive: {
    color: "#fff",
    fontWeight: "600",
  },
  refreshBtn: {
    backgroundColor: "#4285f4",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  refreshBtnText: {
    fontSize: 13,
    color: "#fff",
    fontWeight: "600",
  },
  loadingOverlay: {
    position: "absolute",
    top: 60,
    right: 16,
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    padding: 8,
    borderRadius: 20,
  },
  detailCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  detailCardClosed: {
    backgroundColor: "#e8f5e9", // Light green for closed issues
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    flex: 1,
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
  },
  issueImage: {
    width: "100%",
    height: 200,
  },
  detailContent: {
    padding: 16,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 12,
  },
  statusBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "bold",
  },
  fixInfoContainer: {
    marginBottom: 16,
  },
  fixTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: "#4CAF79",
  },
  fixTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#2C3E50",
    flex: 1,
    lineHeight: 24,
  },
  fixDescriptionCard: {
    backgroundColor: "rgba(76, 175, 121, 0.08)",
    borderLeftWidth: 3,
    borderLeftColor: "#4CAF79",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  fixDescription: {
    fontSize: 14,
    color: "#2C3E50",
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    lineHeight: 20,
  },
  loadingText: {
    fontSize: 13,
    color: "#999",
    fontStyle: "italic",
    marginBottom: 12,
  },
  co2SavedValue: {
    color: "#4CAF79",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
  statItem: {
    width: "50%",
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  metaInfo: {
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 12,
  },
  metaText: {
    fontSize: 12,
    color: "#999",
    marginBottom: 4,
  },
  customMarker: {
    alignItems: "center",
  },
  markerInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  markerText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  markerArrow: {
    width: 0,
    height: 0,
    backgroundColor: "transparent",
    borderStyle: "solid",
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
  callout: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  calloutTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 6,
  },
  calloutRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  calloutDescription: {
    fontSize: 14,
    color: "#666",
  },
  calloutSeverity: {
    fontSize: 13,
    color: "#888",
    fontWeight: "500",
  },
  filterSettingsBtn: {
    backgroundColor: "#4285f4",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
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
    maxHeight: "70%",
  },
  filterModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e1e5e9",
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  filterCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  filterCloseButtonText: {
    fontSize: 24,
    color: "#666",
    fontWeight: "bold",
  },
  filterModalContent: {
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
    gap: 8,
  },
  filterOption: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  filterOptionSelected: {
    backgroundColor: "#6FCF97",
  },
  filterOptionText: {
    color: "#666",
    fontSize: 14,
    fontWeight: "500",
  },
  filterOptionTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  filterActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 24,
    paddingBottom: 16,
  },
  resetButton: {
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    marginRight: 8,
    alignItems: "center",
  },
  resetButtonText: {
    color: "#666",
    fontWeight: "600",
    fontSize: 15,
  },
  applyButton: {
    backgroundColor: "#6FCF97",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
    marginLeft: 8,
    alignItems: "center",
  },
  applyButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
  uploadFixButtonCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#4CAF79",
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginTop: 16,
    gap: 8,
  },
  uploadFixButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});

export default MapScreen;
