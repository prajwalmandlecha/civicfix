import api from "../client";

/**
 * Get user statistics
 * @param {string} userId - User ID
 * @returns {Promise} API response
 */
export const getUserStats = (userId) => {
  return api.get(`/api/users/${userId}/stats`);
};

/**
 * Get user statistics from Firebase
 * @param {string} userId - User ID
 * @returns {Promise} API response
 */
export const getUserStatsFirebase = (userId) => {
  return api.get(`/api/users/${userId}/stats-firebase`);
};
