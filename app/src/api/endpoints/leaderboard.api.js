import api from "../client";

/**
 * Get citizen leaderboard
 * @param {number} limit - Number of entries to fetch
 * @returns {Promise} API response
 */
export const getCitizenLeaderboard = (limit = 10) => {
  return api.get("/api/leaderboard/citizens", {
    params: { limit },
  });
};

/**
 * Get NGO leaderboard
 * @param {number} limit - Number of entries to fetch
 * @returns {Promise} API response
 */
export const getNgoLeaderboard = (limit = 10) => {
  return api.get("/api/leaderboard/ngos", {
    params: { limit },
  });
};
