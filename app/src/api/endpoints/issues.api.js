import api from "../client";

/**
 * Fetch issues with user status (upvote, report)
 * @param {Object} params - Query parameters
 * @param {number} params.latitude - User latitude
 * @param {number} params.longitude - User longitude
 * @param {number} params.limit - Number of issues to fetch
 * @param {number} params.skip - Number of issues to skip (pagination)
 * @returns {Promise} API response
 */
export const fetchIssuesWithUserStatus = (params) => {
  return api.get("/api/issues/with-user-status", { params });
};

/**
 * Fetch issues by location
 * @param {Object} params - Query parameters
 * @returns {Promise} API response
 */
export const fetchIssues = (params) => {
  return api.get("/issues/", { params });
};

/**
 * Submit a new issue
 * @param {FormData} formData - Issue data including image, location, description
 * @param {string} token - Authentication token
 * @returns {Promise} API response
 */
export const submitIssue = (formData, token) => {
  return api.post("/submit-issue", formData, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "multipart/form-data",
    },
    timeout: 60000,
  });
};

/**
 * Upvote an issue
 * @param {string} issueId - Issue ID
 * @returns {Promise} API response
 */
export const upvoteIssue = (issueId) => {
  return api.post(`/api/issues/${issueId}/upvote`);
};

/**
 * Remove upvote from an issue
 * @param {string} issueId - Issue ID
 * @returns {Promise} API response
 */
export const unlikeIssue = (issueId) => {
  return api.post(`/api/issues/${issueId}/unlike`);
};

/**
 * Report an issue
 * @param {string} issueId - Issue ID
 * @param {string} reason - Report reason
 * @returns {Promise} API response
 */
export const reportIssue = (issueId, reason) => {
  return api.post(`/api/issues/${issueId}/report`, { reason });
};

/**
 * Get upvote status for an issue
 * @param {string} issueId - Issue ID
 * @returns {Promise} API response
 */
export const getUpvoteStatus = (issueId) => {
  return api.get(`/api/issues/${issueId}/upvote-status`);
};

/**
 * Get batch upvote status for multiple issues
 * @param {Array<string>} issueIds - Array of issue IDs
 * @returns {Promise} API response
 */
export const getBatchUpvoteStatus = (issueIds) => {
  return api.post("/api/issues/batch-upvote-status", { issue_ids: issueIds });
};
