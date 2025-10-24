const ISSUE_TYPE_MAPPING = {
  DRAIN_BLOCKAGE: "Drain Blockage",
  FALLEN_TREE: "Fallen Tree",
  FLOODING_SURFACE: "Surface Flooding",
  GRAFFITI_VANDALISM: "Graffiti Vandalism",
  GREENSPACE_MAINTENANCE: "Greenspace Maintenance",
  ILLEGAL_CONSTRUCTION_DEBRIS: "Illegal Construction Debris",
  MANHOLE_MISSING_OR_DAMAGED: "Manhole Missing/Damaged",
  POWER_POLE_LINE_DAMAGE: "Power Pole/Line Damage",
  PUBLIC_INFRASTRUCTURE_DAMAGED: "Public Infrastructure Damaged",
  PUBLIC_TOILET_UNSANITARY: "Public Toilet Unsanitary",
  ROAD_POTHOLE: "Road Pothole",
  SIDEWALK_DAMAGE: "Sidewalk Damage",
  SMALL_FIRE_HAZARD: "Small Fire Hazard",
  STRAY_ANIMALS: "Stray Animals",
  STREETLIGHT_OUTAGE: "Streetlight Outage",
  TRAFFIC_OBSTRUCTION: "Traffic Obstruction",
  TRAFFIC_SIGN_DAMAGE: "Traffic Sign Damage",
  WASTE_BULKY_DUMP: "Waste Bulky Dump",
  WASTE_LITTER_SMALL: "Waste Litter Small",
  WATER_LEAK_SURFACE: "Water Leak Surface",
};

export const getIssueDisplayName = (issueType) => {
  if (!issueType) return issueType;

  // Try direct lookup
  if (ISSUE_TYPE_MAPPING[issueType]) {
    return ISSUE_TYPE_MAPPING[issueType];
  }

  // Try uppercase version
  const upperCase = issueType.toUpperCase();
  if (ISSUE_TYPE_MAPPING[upperCase]) {
    return ISSUE_TYPE_MAPPING[upperCase];
  }

  // If no match found, format the string nicely (replace underscores with spaces and title case)
  return issueType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
};

export const getAllIssueTypes = () => {
  return Object.keys(ISSUE_TYPE_MAPPING);
};

export const getIssueTypesWithNames = () => {
  return ISSUE_TYPE_MAPPING;
};

export default ISSUE_TYPE_MAPPING;
