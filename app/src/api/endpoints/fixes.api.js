import api from "../client";

/**
 * Submit a fix for an issue
 * @param {string} issueId - Issue ID
 * @param {FormData} formData - Fix data including images and description
 * @returns {Promise} API response
 */
export const submitFix = (issueId, formData) => {
  return api.post(`/api/issues/${issueId}/submit-fix`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    timeout: 60000,
  });
};

/**
 * Get fix details for an issue
 * @param {string} issueId - Issue ID
 * @returns {Promise} API response
 */
export const getFixDetails = (issueId) => {
  return api.get(`/api/issues/${issueId}/fix-details`);
};

/**
 * Get all fixes
 * @returns {Promise} API response
 */
export const getAllFixes = () => {
  return api.get("/api/fixes");
};

