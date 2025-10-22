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
} from "react-native";
import MapView, {
  Marker,
  Heatmap,
  PROVIDER_GOOGLE,
  Callout,
} from "react-native-maps";
import * as Location from "expo-location";
import { useUserContext } from "../context/UserContext";
import api from "../services/api";

// Custom Marker Component
const CustomMarker = ({ severity }) => {
  const color = getSeverityColor(severity || 5);
  return (
    <View style={styles.customMarker}>
      <View style={[styles.markerInner, { backgroundColor: color }]}>
        <Text style={styles.markerText}>{Math.round(severity || 5)}</Text>
      </View>
      <View style={[styles.markerArrow, { borderTopColor: color }]} />
    </View>
  );
};

const getSeverityColor = (severityScore) => {
  if (severityScore >= 7) return "#991B1B"; // Dark red
  if (severityScore >= 5) return "#EF4444"; // Red
  if (severityScore >= 3) return "#F97316"; // Orange
  if (severityScore >= 1) return "#EAB308"; // Yellow
  return "#22C55E"; // Green
};

const getStatusColor = (status) => {
  switch (status?.toLowerCase()) {
    case "closed":
      return "#22C55E";
    case "verified":
      return "#EAB308";
    case "open":
      return "#F97316";
    default:
      return "#9CA3AF";
  }
};

const MapScreen = () => {
  const mapRef = useRef(null);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLocation, setUserLocation] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [showMarkers, setShowMarkers] = useState(true);
  const [currentZoom, setCurrentZoom] = useState(13);
  const [locationError, setLocationError] = useState(false);
  const [region, setRegion] = useState({
    latitude: 12.9716,
    longitude: 77.5946,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  });

  const displayIssues = React.useMemo(() => {
    return issues.filter((issue) => issue.status?.toLowerCase() !== "closed");
  }, [issues]);

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

      // Get current location with timeout
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 0,
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

  const getMarkerColor = (issue) => {
    // Color based on severity score
    const severityScore = issue.severity_score || 5;
    return getSeverityColor(severityScore);
  };

  const getMarkerTitle = (issue) => {
    const issueTypes = issue.issue_types || [];
    if (issueTypes.length > 0) {
      return issueTypes.join(", ");
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

  const handleMarkerPress = (issue) => {
    setSelectedIssue(issue);
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

  const getMarkerPinColor = (issue) => {
    const severityScore = issue.severity_score || 5;
    return getSeverityColor(severityScore);
  };

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
            {displayIssues.length} issues
          </Text>
        </View>

        <View style={styles.filterRight}>
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
              Heatmap
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
              Markers
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.refreshBtn}
            onPress={handleRefresh}
            activeOpacity={0.7}
          >
            <Text style={styles.refreshBtnText}>Refresh</Text>
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
              colors: ["#22C55E", "#EAB308", "#F97316", "#EF4444", "#991B1B"],
              startPoints: [0.1, 0.3, 0.5, 0.7, 0.9],
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
                  <CustomMarker severity={issue.severity_score} />
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

      {/* Issue Detail Card */}
      {selectedIssue && (
        <View style={styles.detailCard}>
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

              {/* Description */}
              {selectedIssue.description && (
                <Text style={styles.description}>
                  {selectedIssue.description}
                </Text>
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
                  <Text style={styles.statLabel}>CO₂ Saved</Text>
                  <Text style={styles.statValue}>
                    {selectedIssue.co2_kg_saved || 0} kg
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Fate Risk</Text>
                  <Text style={styles.statValue}>
                    {selectedIssue.fate_risk_co2 || 0} kg
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
  description: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
    lineHeight: 20,
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
});

export default MapScreen;
