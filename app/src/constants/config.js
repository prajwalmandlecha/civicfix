/**
 * App configuration constants
 */

export const API_CONFIG = {
  BASE_URL: "https://civicfix-backend-809180458813.asia-south1.run.app",
  TIMEOUT: 60000,
};

export const LOCATION_CONFIG = {
  DEFAULT_REGION: {
    latitude: 12.9716,
    longitude: 77.5946,
    latitudeDelta: 0.0922,
    longitudeDelta: 0.0421,
  },
  DEFAULT_RADIUS_KM: 10,
  ACCURACY: "high",
};

export const PAGINATION_CONFIG = {
  DEFAULT_LIMIT: 20,
  LOAD_MORE_THRESHOLD: 0.5,
};

export const SEVERITY_LEVELS = {
  HIGH: { min: 8, label: "High", color: "#991B1B" },
  MEDIUM: { min: 4, max: 8, label: "Medium", color: "#F97316" },
  LOW: { max: 4, label: "Low", color: "#22C55E" },
};

export const ISSUE_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
  ALL: "all",
};

export const COLORS = {
  PRIMARY: "#4285f4",
  SUCCESS: "#4CAF79",
  WARNING: "#F97316",
  DANGER: "#991B1B",
  GRAY: "#9CA3AF",
};

