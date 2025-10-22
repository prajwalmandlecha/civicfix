import axios from "axios";

const api = axios.create({
  baseURL: "http://10.193.196.8:8000",
});

export const fetchNearbyIssues = async (
  latitude,
  longitude,
  radiusKm = 10,
  limit = 100,
  daysBack = 90
) => {
  try {
    const response = await api.get("/issues/", {
      params: {
        latitude,
        longitude,
        radius_km: radiusKm,
        limit,
        days_back: daysBack,
      },
    });
    return response.data;
  } catch (error) {
    console.error("Error fetching nearby issues:", error);
    throw error;
  }
};

export const fetchLatestIssues = async (limit = 10, daysBack = null) => {
  try {
    const params = { limit };
    if (daysBack) {
      params.days_back = daysBack;
    }
    const response = await api.get("/issues/latest", { params });
    return response.data;
  } catch (error) {
    console.error("Error fetching latest issues:", error);
    throw error;
  }
};

export default api;
