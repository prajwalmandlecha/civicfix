import React, { useRef, useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  ActivityIndicator,
  Text,
  Alert,
  TouchableOpacity,
} from "react-native";
import MapView, { Marker, Heatmap, PROVIDER_GOOGLE } from "react-native-maps";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useUserContext } from "../context/UserContext";
import api from "../services/api";
import IssueDetailModal from "../components/IssueDetailModal";
import FilterModal from "../components/FilterModal";

const getSeverityColor = (severityScore) => {
  if (severityScore >= 8) return "#991B1B";
  if (severityScore >= 4) return "#F97316";
  return "#22C55E";
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
  const [modalVisible, setModalVisible] = useState(false);
  const [filters, setFilters] = useState({
    status: "open",
    severity: "all",
    days: 30,
    issueTypes: [],
    limit: 50,
  });
  const [loadingFilters, setLoadingFilters] = useState(false);
  const [region, setRegion] = useState(
    lastLocation?.coords
      ? {
        latitude: lastLocation.coords.latitude,
        longitude: lastLocation.coords.longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }
      : {
        latitude: 12.9716,
        longitude: 77.5946,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
      }
  );

  const { userType, lastLocation } = useUserContext();

  // Helper: normalize location to support {lat, lon} and {latitude, longitude}
  const getLatLon = (loc) => {
    if (!loc) return { lat: undefined, lon: undefined };
    const lat =
      typeof loc.lat === "number"
        ? loc.lat
        : typeof loc.latitude === "number"
          ? loc.latitude
          : undefined;
    const lon =
      typeof loc.lon === "number"
        ? loc.lon
        : typeof loc.longitude === "number"
          ? loc.longitude
          : undefined;
    return { lat, lon };
  };

  // React Compiler will optimize this
  const getDisplayIssues = () => {
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

    // Filter by issue types (intersection)
    if (filters.issueTypes && filters.issueTypes.length > 0) {
      const selectedSet = new Set(
        filters.issueTypes.map((t) => String(t).toUpperCase())
      );
      filtered = filtered.filter((issue) => {
        const source = issue.issue_types || issue.detected_issues || [];
        const types = source.map((t) =>
          typeof t === "string"
            ? t.toUpperCase()
            : String(t?.type || t?.name || t).toUpperCase()
        );
        return types.some((t) => selectedSet.has(t));
      });
    }

    // Default sort by severity (desc)
    filtered.sort((a, b) => (b.severity_score || 0) - (a.severity_score || 0));

    return filtered;
  };

  const displayIssues = getDisplayIssues();

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
          limit: filters.limit, // controlled via filter
          days_back: filters.days, // controlled via filter
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

  const onRegionChangeComplete = (newRegion) => {
    // Clear previous timeout
    if (fetchDebounceRef.current) {
      clearTimeout(fetchDebounceRef.current);
    }

    // Debounce API call for 300ms for faster response
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
          newRegion.latitudeDelta * 111,
          newRegion.longitudeDelta * 111
        );

        // Update zoom level based on latitudeDelta
        const estimatedZoom = Math.round(
          Math.log2(360 / newRegion.latitudeDelta)
        );
        setCurrentZoom(estimatedZoom);

        fetchIssues(newRegion.latitude, newRegion.longitude, radiusKm);
      }
    }, 300);
  };

  const handleMarkerPress = async (issue) => {
    const { lat, lon } = getLatLon(issue.location);
    const transformedIssue = {
      id: issue.issue_id,
      issueTypes: issue.detected_issues || issue.issue_types || [],
      location:
        lat != null && lon != null
          ? `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`
          : "Unknown location",
      postImage: issue.photo_url ? { uri: issue.photo_url } : null,
      impactLevel:
        issue.severity_score >= 8
          ? "High"
          : issue.severity_score >= 4
            ? "Medium"
            : "Low",
      co2Impact: issue.co2_kg_saved || issue.fate_risk_co2 || 0,
      likes:
        typeof issue.upvotes === "object"
          ? issue.status?.toLowerCase() === "closed"
            ? issue.upvotes.closed || 0
            : issue.upvotes.open || 0
          : issue.upvotes || 0,
      status: issue.status,
      description: issue.description,
      createdAt: issue.created_at,
      severityScore: issue.severity_score,
      distanceKm: issue.distance_km,
      detailedData: issue,
      userStatus: { hasUpvoted: false, hasReported: false }, // Default since we don't have this data in LocationScreen
    };

    setSelectedIssue(transformedIssue);
    setModalVisible(true);

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
    // Close modal first
    setModalVisible(false);
    setSelectedIssue(null);

    // Convert issue format to match what FixUploadScreen expects
    const issueData = {
      id: issue.id,
      postImage: issue.postImage,
      location: issue.location,
      issueTypes: issue.issueTypes,
    };

    navigation.navigate("FixUpload", {
      issueId: issue.id,
      issueData: issueData,
    });
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedIssue(null);
    setFixDetails(null);
  };

  const handleApplyFilters = (newFilters) => {
    setFilters(newFilters);
    setFiltersVisible(false);
    // Trigger a re-fetch with current center and radius
    setLoadingFilters(true);
    const centerLat = userLocation?.latitude || region?.latitude;
    const centerLon = userLocation?.longitude || region?.longitude;
    if (centerLat && centerLon) {
      const radiusKm = Math.max(
        (region?.latitudeDelta || 0.05) * 111,
        (region?.longitudeDelta || 0.05) * 111
      );
      fetchIssues(centerLat, centerLon, radiusKm).finally(() =>
        setLoadingFilters(false)
      );
    } else {
      setLoadingFilters(false);
    }
  };

  const handleResetFilters = (resetFilters) => {
    setFilters(resetFilters);
  };

  const handleRefresh = async () => {
    if (locationError) {
      await initializeMap();
    } else if (userLocation) {
      fetchIssues(userLocation.latitude, userLocation.longitude);
    } else if (region) {
      fetchIssues(region.latitude, region.longitude);
    }
  };

  const toggleHeatmap = () => {
    setShowHeatmap((prev) => !prev);
  };

  const toggleMarkers = () => {
    setShowMarkers((prev) => !prev);
  };

  // React Compiler will optimize this
  const getHeatmapPoints = () => {
    const filtered = getDisplayIssues();
    return filtered
      .map((issue) => ({ issue, ...getLatLon(issue.location) }))
      .filter(
        ({ lat, lon }) => typeof lat === "number" && typeof lon === "number"
      )
      .map(({ issue, lat, lon }) => ({
        latitude: lat,
        longitude: lon,
        weight: (issue.severity_score || 5) / 10,
      }));
  };

  const heatmapPoints = getHeatmapPoints();

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
            radius={50}
            opacity={0.6}
            maxIntensity={100}
            gradientSmoothing={10}
            gradient={{
              colors: [
                "#991B1B",                  // Dark red - high severity
                "#EF4444",                  // Red - high severity
                "#F97316",                  // Orange - medium severity
                "rgba(34, 197, 94, 0.7)",  // Green - low severity
                "rgba(34, 197, 94, 0)",    // Transparent green - very low severity
              ],
              startPoints: [0.0, 0.25, 0.5, 0.75, 1.0],
              colorMapSize: 1024,
            }}
          />
        )}

        {/* Individual Issue Markers */}
        {showMarkers &&
          displayIssues.map((issue, index) => {
            const { lat, lon } = getLatLon(issue.location);
            if (typeof lat === "number" && typeof lon === "number") {
              return (
                <Marker
                  key={issue.issue_id || `issue-${index}`}
                  coordinate={{ latitude: lat, longitude: lon }}
                  onPress={() => handleMarkerPress(issue)}
                  tracksViewChanges={false}
                >
                  <CustomMarker issue={issue} />
                </Marker>
              );
            }
            return null;
          })}
      </MapView>

      {(loading && issues.length > 0) || loadingFilters ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color="#6FCF97" />
        </View>
      ) : null}

      {/* Filter Modal - Using reusable component */}
      <FilterModal
        visible={filtersVisible}
        onClose={() => setFiltersVisible(false)}
        filters={filters}
        onApply={handleApplyFilters}
        onReset={handleResetFilters}
        showRadiusFilter={false}
        showLimitFilter={true}
      />

      {/* Issue Detail Modal */}
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
    height: "70%",
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
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
    paddingHorizontal: 16,
    paddingTop: 16,
    flex: 1,
  },
  filterModalContentContainer: {
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
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
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
    marginTop: 12,
    paddingBottom: 12,
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
});

export default MapScreen;
