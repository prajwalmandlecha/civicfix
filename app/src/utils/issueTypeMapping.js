
const ISSUE_TYPE_MAPPING = {
  exposed_power_cables: "Exposed Power Cables",
  illegal_dumping_bulky_waste: "Illegal Dumping (Bulky Waste)",
  illegal_hoarding: "Illegal Hoarding",
  waterlogging: "Waterlogging",
  encroachment_public_space: "Public Space Encroachment",
  illegal_construction_small: "Illegal Construction",
  visible_pollution: "Visible Pollution",
  streetlight_out: "Streetlight Out",
  overflowing_garbage_bin: "Overflowing Garbage Bin",
  broken_infrastructure: "Broken Infrastructure",
  public_toilet_nonfunctional: "Non-Functional Public Toilet",
  sewer_blockage: "Sewer Blockage",
  uncollected_household_waste: "Uncollected Household Waste",
  unregulated_construction_activity: "Unregulated Construction Activity",
  public_health_hazard: "Public Health Hazard",
};


export const getIssueDisplayName = (issueType) => {
  return ISSUE_TYPE_MAPPING[issueType] || issueType;
};

export const getAllIssueTypes = () => {
  return Object.keys(ISSUE_TYPE_MAPPING);
};


export const getIssueTypesWithNames = () => {
  return ISSUE_TYPE_MAPPING;
};

export default ISSUE_TYPE_MAPPING;
