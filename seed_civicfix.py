import os
import json
import random
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dotenv import load_dotenv
from elasticsearch import Elasticsearch

# Import Gemini for embeddings
try:
    from google import genai
    EMBEDDING_ENABLED = True
except ImportError:
    print("Warning: google-genai not installed. Embeddings will be None.")
    EMBEDDING_ENABLED = False

# Load environment variables
load_dotenv()

# --- Configuration ---
ELASTICSEARCH_HOST_IP = os.getenv("ELASTICSEARCH_HOST_IP")
ELASTICSEARCH_PORT = int(os.getenv("ELASTICSEARCH_PORT", 9200))
ELASTICSEARCH_USER = os.getenv("ELASTICSEARCH_USER")
ELASTICSEARCH_PASSWORD = os.getenv("ELASTICSEARCH_PASSWORD")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")

# Initialize Gemini client for embeddings
gemini_client = None
if EMBEDDING_ENABLED and GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=GEMINI_API_KEY)
        print(f"✅ Gemini client initialized for embeddings using {EMBEDDING_MODEL}")
    except Exception as e:
        print(f"⚠️  Failed to initialize Gemini client: {e}")
        gemini_client = None
elif EMBEDDING_ENABLED and not GEMINI_API_KEY:
    print("⚠️  GEMINI_API_KEY not set. Embeddings will be None.")
elif EMBEDDING_ENABLED and not GEMINI_API_KEY:
    print("⚠️  GEMINI_API_KEY not set. Embeddings will be None.")

# --- Constants ---
ANONYMOUS_USER_ID = "anon_user_001"
ANONYMOUS_DISPLAY_NAME = "Anonymous"

# Sample NGO IDs
NGO_IDS = [
    "ngo_greencity_001",
    "ngo_urbanfix_002",
    "ngo_cleanstreets_003",
    "ngo_citycare_004",
    "ngo_civicworks_005"
]

# Sample Citizen IDs
CITIZEN_IDS = [
    "citizen_raj_001",
    "citizen_priya_002",
    "citizen_amit_003",
    "citizen_neha_004",
    "citizen_vikram_005",
    "citizen_sara_006",
    "citizen_rohan_007",
    "citizen_anita_008"
]

CITIZEN_NAMES = [
    "Raj Kumar",
    "Priya Sharma",
    "Amit Patel",
    "Neha Gupta",
    "Vikram Singh",
    "Sara Khan",
    "Rohan Mehta",
    "Anita Verma"
]

# Pune coordinates (lat, lon)
LOCATION_RANGES = {
    "lat": (18.45, 18.65),
    "lon": (73.75, 73.95)
}

# Issue type descriptions and metadata
ISSUE_TYPE_METADATA = {
    "DRAIN_BLOCKAGE": {
        "severity_range": (6.0, 9.0),
        "fate_risk_co2": (15.0, 35.0),
        "descriptions": [
            "Severe drain blockage causing water accumulation",
            "Blocked drainage system needs urgent attention",
            "Clogged drain creating waterlogging issues"
        ],
        "captions": [
            "Blocked drain with accumulated debris and standing water visible",
            "Drainage system completely clogged with waste materials",
            "Severe blockage in drain causing overflow and health hazards"
        ],
        "future_impact": "Can lead to flooding, mosquito breeding, and waterborne diseases",
        "predicted_fix": "Remove debris, clean drain pipes, and install protective grating"
    },
    "FALLEN_TREE": {
        "severity_range": (7.0, 9.5),
        "fate_risk_co2": (25.0, 50.0),
        "descriptions": [
            "Large tree fallen blocking the road",
            "Fallen tree obstructing traffic and pedestrian movement",
            "Tree collapsed during storm blocking pathway"
        ],
        "captions": [
            "Large tree trunk fallen across the road blocking vehicular movement",
            "Uprooted tree with exposed roots blocking the entire pathway",
            "Massive tree branch fallen creating significant obstruction"
        ],
        "future_impact": "Traffic disruption, potential accidents, and complete road blockage",
        "predicted_fix": "Remove tree using specialized equipment, clear debris, repair damaged surface"
    },
    "FLOODING_SURFACE": {
        "severity_range": (7.5, 9.0),
        "fate_risk_co2": (30.0, 60.0),
        "descriptions": [
            "Severe surface flooding affecting residential areas",
            "Water accumulation on streets causing mobility issues",
            "Flash flooding creating hazardous conditions"
        ],
        "captions": [
            "Street completely flooded with water reaching knee height",
            "Significant water accumulation covering road surface entirely",
            "Flood water submerging vehicles and affecting properties"
        ],
        "future_impact": "Property damage, health risks, and transportation disruption",
        "predicted_fix": "Improve drainage system, pump out water, and prevent recurrence"
    },
    "GRAFFITI_VANDALISM": {
        "severity_range": (3.0, 5.5),
        "fate_risk_co2": (5.0, 12.0),
        "descriptions": [
            "Graffiti vandalism on public property walls",
            "Spray paint vandalism damaging public infrastructure",
            "Unauthorized artwork defacing public spaces"
        ],
        "captions": [
            "Multiple spray paint markings covering public wall surfaces",
            "Graffiti covering significant portion of building facade",
            "Vandalized public property with unauthorized paint markings"
        ],
        "future_impact": "Aesthetic degradation and encourages further vandalism",
        "predicted_fix": "Clean and repaint affected surfaces with anti-graffiti coating"
    },
    "GREENSPACE_MAINTENANCE": {
        "severity_range": (4.0, 6.5),
        "fate_risk_co2": (10.0, 25.0),
        "descriptions": [
            "Overgrown vegetation requiring maintenance",
            "Public garden in need of landscaping and care",
            "Neglected green space with overgrown plants"
        ],
        "captions": [
            "Overgrown plants and weeds covering public green space",
            "Unmaintained garden with excessive vegetation growth",
            "Green area requiring pruning and landscaping work"
        ],
        "future_impact": "Loss of usable public space and pest breeding grounds",
        "predicted_fix": "Trim vegetation, maintain landscaping, and establish regular care schedule"
    },
    "ILLEGAL_CONSTRUCTION_DEBRIS": {
        "severity_range": (6.5, 8.5),
        "fate_risk_co2": (20.0, 45.0),
        "descriptions": [
            "Construction waste illegally dumped on public land",
            "Building debris blocking pedestrian walkways",
            "Unauthorized disposal of construction materials"
        ],
        "captions": [
            "Large pile of construction debris including concrete and metal scraps",
            "Construction waste dumped illegally on street corner",
            "Building materials and rubble blocking public pathway"
        ],
        "future_impact": "Environmental pollution, safety hazards, and blocked access",
        "predicted_fix": "Remove debris, dispose properly, and penalize offenders"
    },
    "MANHOLE_MISSING_OR_DAMAGED": {
        "severity_range": (8.0, 9.5),
        "fate_risk_co2": (35.0, 70.0),
        "descriptions": [
            "Missing manhole cover creating dangerous situation",
            "Damaged manhole posing serious safety risk",
            "Open manhole without protective covering"
        ],
        "captions": [
            "Open manhole without cover exposing deep underground cavity",
            "Broken manhole cover with jagged edges and partial opening",
            "Missing manhole lid creating life-threatening hazard"
        ],
        "future_impact": "Risk of fatal accidents, especially during night or rain",
        "predicted_fix": "Install new manhole cover, secure properly, and add reflective markings"
    },
    "POWER_POLE_LINE_DAMAGE": {
        "severity_range": (7.5, 9.0),
        "fate_risk_co2": (40.0, 80.0),
        "descriptions": [
            "Damaged electrical pole with exposed wires",
            "Power line hanging dangerously low",
            "Leaning electricity pole requiring urgent repair"
        ],
        "captions": [
            "Tilted power pole with exposed electrical wiring",
            "Damaged electrical infrastructure with hanging cables",
            "Power pole showing structural damage and safety concerns"
        ],
        "future_impact": "Electrocution risk, power outages, and potential fire hazards",
        "predicted_fix": "Replace damaged pole, secure wiring, and restore safe electrical supply"
    },
    "PUBLIC_INFRASTRUCTURE_DAMAGED": {
        "severity_range": (5.5, 8.0),
        "fate_risk_co2": (15.0, 40.0),
        "descriptions": [
            "Damaged public infrastructure requiring repair",
            "Broken public facility affecting community services",
            "Deteriorated civic amenity needing restoration"
        ],
        "captions": [
            "Damaged public structure showing signs of deterioration",
            "Broken civic infrastructure requiring immediate attention",
            "Public facility in state of disrepair affecting usability"
        ],
        "future_impact": "Reduced public service quality and potential safety issues",
        "predicted_fix": "Repair or replace damaged infrastructure and prevent further deterioration"
    },
    "PUBLIC_TOILET_UNSANITARY": {
        "severity_range": (7.0, 8.5),
        "fate_risk_co2": (20.0, 35.0),
        "descriptions": [
            "Public toilet in extremely unhygienic condition",
            "Unsanitary restroom requiring immediate cleaning",
            "Filthy public washroom posing health risks"
        ],
        "captions": [
            "Public toilet facility in severely unhygienic state",
            "Unsanitary washroom with visible filth and damage",
            "Extremely dirty public restroom requiring deep cleaning"
        ],
        "future_impact": "Spread of diseases and public health hazards",
        "predicted_fix": "Deep cleaning, sanitization, and regular maintenance schedule"
    },
    "ROAD_POTHOLE": {
        "severity_range": (6.0, 8.5),
        "fate_risk_co2": (18.0, 40.0),
        "descriptions": [
            "Deep pothole causing vehicle damage",
            "Road crater requiring immediate patching",
            "Large pothole creating traffic hazard"
        ],
        "captions": [
            "Deep road pothole with broken asphalt and exposed base",
            "Large crater in road surface causing vehicle damage",
            "Significant road depression with crumbling edges"
        ],
        "future_impact": "Vehicle damage, accidents, and worsening road conditions",
        "predicted_fix": "Fill pothole with asphalt, compact properly, and resurface area"
    },
    "SIDEWALK_DAMAGE": {
        "severity_range": (5.0, 7.5),
        "fate_risk_co2": (12.0, 30.0),
        "descriptions": [
            "Broken sidewalk creating tripping hazard",
            "Damaged pavement affecting pedestrian safety",
            "Cracked footpath requiring repair"
        ],
        "captions": [
            "Broken sidewalk tiles with uneven surface and gaps",
            "Damaged pavement showing cracks and missing sections",
            "Deteriorated footpath with safety hazards for pedestrians"
        ],
        "future_impact": "Pedestrian injuries, accessibility issues, and further deterioration",
        "predicted_fix": "Replace damaged tiles, level surface, and ensure proper drainage"
    },
    "SMALL_FIRE_HAZARD": {
        "severity_range": (7.5, 9.5),
        "fate_risk_co2": (30.0, 65.0),
        "descriptions": [
            "Fire hazard from accumulated flammable materials",
            "Potential fire risk from exposed electrical wiring",
            "Hazardous condition with fire danger"
        ],
        "captions": [
            "Flammable waste accumulated creating fire hazard",
            "Exposed electrical components posing fire risk",
            "Dangerous accumulation of combustible materials"
        ],
        "future_impact": "Risk of fire outbreak, property damage, and loss of life",
        "predicted_fix": "Remove flammable materials, secure electrical sources, and implement safety measures"
    },
    "STRAY_ANIMALS": {
        "severity_range": (4.5, 6.5),
        "fate_risk_co2": (8.0, 20.0),
        "descriptions": [
            "Stray dogs creating nuisance in public areas",
            "Uncontrolled animal population affecting community",
            "Street animals requiring management intervention"
        ],
        "captions": [
            "Multiple stray dogs roaming in public spaces",
            "Unmanaged street animal population in residential area",
            "Stray animals creating sanitation and safety concerns"
        ],
        "future_impact": "Public safety concerns, sanitation issues, and disease transmission",
        "predicted_fix": "Animal control intervention, vaccination drives, and shelter programs"
    },
    "STREETLIGHT_OUTAGE": {
        "severity_range": (6.0, 7.5),
        "fate_risk_co2": (15.0, 30.0),
        "descriptions": [
            "Non-functional streetlights creating darkness",
            "Multiple street lamps not working",
            "Lighting failure affecting public safety"
        ],
        "captions": [
            "Dark street with non-functional streetlights",
            "Multiple lamp posts without illumination",
            "Street lighting system failure creating safety concerns"
        ],
        "future_impact": "Increased crime risk, accidents, and reduced public safety",
        "predicted_fix": "Replace bulbs, repair electrical connections, and test functionality"
    },
    "TRAFFIC_OBSTRUCTION": {
        "severity_range": (6.5, 8.0),
        "fate_risk_co2": (20.0, 40.0),
        "descriptions": [
            "Major obstruction blocking traffic flow",
            "Road blockage causing severe congestion",
            "Objects obstructing vehicular movement"
        ],
        "captions": [
            "Large objects blocking road and causing traffic jam",
            "Obstruction preventing normal traffic movement",
            "Road blockage affecting vehicular and pedestrian flow"
        ],
        "future_impact": "Traffic congestion, delays, and economic productivity loss",
        "predicted_fix": "Remove obstruction, clear debris, and restore normal traffic flow"
    },
    "TRAFFIC_SIGN_DAMAGE": {
        "severity_range": (5.5, 7.5),
        "fate_risk_co2": (12.0, 25.0),
        "descriptions": [
            "Damaged traffic sign affecting road safety",
            "Broken or missing road signage",
            "Traffic control sign requiring replacement"
        ],
        "captions": [
            "Damaged traffic sign with faded or missing information",
            "Broken road signage affecting driver guidance",
            "Deteriorated traffic control sign requiring replacement"
        ],
        "future_impact": "Traffic confusion, accidents, and violation of road rules",
        "predicted_fix": "Replace damaged sign, ensure visibility, and proper installation"
    },
    "WASTE_BULKY_DUMP": {
        "severity_range": (6.5, 8.0),
        "fate_risk_co2": (18.0, 40.0),
        "descriptions": [
            "Large furniture and appliances dumped illegally",
            "Bulky waste creating environmental hazard",
            "Illegal dumping of large household items"
        ],
        "captions": [
            "Large pile of discarded furniture and appliances",
            "Bulky waste including mattresses and electronics dumped illegally",
            "Significant accumulation of large household waste items"
        ],
        "future_impact": "Environmental pollution, pest breeding, and aesthetic degradation",
        "predicted_fix": "Remove bulky waste, dispose properly, and implement monitoring"
    },
    "WASTE_LITTER_SMALL": {
        "severity_range": (4.0, 6.0),
        "fate_risk_co2": (8.0, 18.0),
        "descriptions": [
            "Scattered litter affecting cleanliness",
            "Small waste items littering public spaces",
            "General litter requiring cleanup"
        ],
        "captions": [
            "Scattered plastic bags, bottles, and food wrappers",
            "General litter including small waste items on ground",
            "Public space littered with small trash and debris"
        ],
        "future_impact": "Environmental pollution, drainage blockage, and health hazards",
        "predicted_fix": "Clean up litter, install waste bins, and conduct awareness campaigns"
    },
    "WATER_LEAK_SURFACE": {
        "severity_range": (6.5, 8.5),
        "fate_risk_co2": (20.0, 45.0),
        "descriptions": [
            "Water pipeline leak causing wastage",
            "Visible water leakage on road surface",
            "Broken water pipe requiring urgent repair"
        ],
        "captions": [
            "Continuous water flow from underground pipe leak",
            "Visible water leakage creating puddles on street",
            "Broken water main causing significant water wastage"
        ],
        "future_impact": "Water wastage, road damage, and infrastructure deterioration",
        "predicted_fix": "Repair pipe leak, restore water supply, and fix damaged surface"
    }
}

# Fixes specific assignments
FIXES_ASSIGNMENTS = {
    "DRAIN_BLOCKAGE": {"num_issues": 1, "fixes_per_issue": 4},
    "ILLEGAL_CONSTRUCTION_DEBRIS": {"num_issues": 2, "fixes_per_issue": 1},
    "ROAD_POTHOLE": {"num_issues": 3, "fixes_per_issue": [3, 4]},
    "SIDEWALK_DAMAGE": {"num_issues": 3, "fixes_per_issue": 1},
    "WASTE_LITTER_SMALL": {"num_issues": 4, "fixes_per_issue": [3, 4]},
    "WATER_LEAK_SURFACE": {"num_issues": 2, "fixes_per_issue": [3, 4]}
}


def create_es_client() -> Elasticsearch:
    """Create and return a configured Elasticsearch client."""
    return Elasticsearch(
        hosts=[f"https://{ELASTICSEARCH_HOST_IP}:{ELASTICSEARCH_PORT}"],
        basic_auth=(ELASTICSEARCH_USER, ELASTICSEARCH_PASSWORD),
        verify_certs=False,
        ssl_assert_hostname=False,
        ssl_show_warn=False
    )


def generate_embedding(text: str) -> List[float]:
    """Generate embedding using Gemini embedding model."""
    if not gemini_client:
        return None
    
    try:
        result = gemini_client.models.embed_content(
            model=EMBEDDING_MODEL,
            contents=text
        )
        
        if hasattr(result, 'embeddings') and result.embeddings:
            embedding = result.embeddings[0]
            if hasattr(embedding, 'values'):
                return list(embedding.values)
        return None
    except Exception as e:
        print(f"⚠️  Embedding generation failed: {e}")
        return None


def generate_random_location() -> Dict[str, float]:
    """Generate random location within Pune area."""
    lat = random.uniform(*LOCATION_RANGES["lat"])
    lon = random.uniform(*LOCATION_RANGES["lon"])
    return {"lat": lat, "lon": lon}


def generate_random_date(start_days_ago: int = 15, end_days_ago: int = 0) -> datetime:
    """Generate random datetime within specified range."""
    start = datetime.now() - timedelta(days=start_days_ago)
    end = datetime.now() - timedelta(days=end_days_ago)
    delta = end - start
    random_seconds = random.randint(0, int(delta.total_seconds()))
    return start + timedelta(seconds=random_seconds)


def generate_reporter_info(anonymous_probability: float = 0.3) -> Tuple[str, str, str]:
    """
    Generate reporter information.
    Returns: (user_id, display_name, source)
    """
    if random.random() < anonymous_probability:
        return ANONYMOUS_USER_ID, ANONYMOUS_DISPLAY_NAME, "anonymous"
    else:
        idx = random.randint(0, len(CITIZEN_IDS) - 1)
        return CITIZEN_IDS[idx], CITIZEN_NAMES[idx], "citizen"


def generate_detected_issues(issue_types: List[str], user_selected_labels: List[str]) -> List[Dict]:
    """Generate detected_issues nested structure."""
    detected = []
    
    for issue_type in issue_types:
        metadata = ISSUE_TYPE_METADATA.get(issue_type, {})
        
        # Higher confidence if user selected this label
        if issue_type in user_selected_labels:
            confidence = random.uniform(0.85, 0.98)
        else:
            confidence = random.uniform(0.60, 0.92)
        
        severity_range = metadata.get("severity_range", (5.0, 8.0))
        severity_score = random.uniform(*severity_range)
        
        # Determine severity level
        if severity_score >= 8.0:
            severity = "high"
        elif severity_score >= 5.5:
            severity = "medium"
        else:
            severity = "low"
        
        # Auto review flag: true if confidence is between 0.6-0.85
        auto_review_flag = 0.60 <= confidence <= 0.85
        
        detected.append({
            "type": issue_type,
            "confidence": round(confidence, 3),
            "severity": severity,
            "severity_score": round(severity_score, 2),
            "future_impact": metadata.get("future_impact", "Potential negative impact on community"),
            "predicted_fix": metadata.get("predicted_fix", "Requires assessment and appropriate action"),
            "predicted_fix_confidence": round(random.uniform(0.65, 0.90), 3),
            "auto_review_flag": auto_review_flag
        })
    
    return detected


def generate_issue_document(
    issue_type: str,
    photo_url: str,
    is_fixed: bool = False,
    fix_date: Optional[datetime] = None
) -> Dict:
    """Generate a complete issue document."""
    
    issue_id = f"issue_{uuid.uuid4().hex[:12]}"
    
    # Reporter info
    reported_by, display_name, source = generate_reporter_info()
    
    # Dates (within last 15 days)
    created_at = generate_random_date(15, 7)
    
    if is_fixed:
        status = "closed"
        closed_by = random.choice(NGO_IDS)
        closed_at = fix_date or generate_random_date(6, 1)
        # Ensure closed_at is after created_at
        if closed_at < created_at:
            closed_at = created_at + timedelta(days=random.randint(1, 5))
        updated_at = closed_at
    else:
        status = "open"
        closed_by = None
        closed_at = None
        updated_at = created_at
    
    # Location
    location = generate_random_location()
    
    # Get metadata
    metadata = ISSUE_TYPE_METADATA.get(issue_type, {})
    
    # User selected labels (may include the main type and sometimes empty or multiple)
    user_selected_labels_choice = random.choice([
        [],  # No labels
        [issue_type],  # Correct label
        [issue_type, random.choice(list(ISSUE_TYPE_METADATA.keys()))],  # Multiple labels
    ])
    
    # Description
    description = random.choice(metadata.get("descriptions", ["Issue reported in this area"]))
    
    # Auto caption
    auto_caption = random.choice(metadata.get("captions", ["Image showing reported issue"]))
    
    # Detected issues - could be just the main type or multiple if severe
    issue_types_list = [issue_type]
    if random.random() < 0.2:  # 20% chance of multiple issues
        additional_type = random.choice([t for t in ISSUE_TYPE_METADATA.keys() if t != issue_type])
        issue_types_list.append(additional_type)
    
    detected_issues = generate_detected_issues(issue_types_list, user_selected_labels_choice)
    
    # Label confidences
    label_confidences = {di["type"]: di["confidence"] for di in detected_issues}
    
    # Severity score (aggregate)
    severity_score = max([di["severity_score"] for di in detected_issues])
    
    # Fate risk CO2
    fate_risk_range = metadata.get("fate_risk_co2", (10.0, 30.0))
    fate_risk_co2 = round(random.uniform(*fate_risk_range), 2)
    
    # CO2 saved (only if fixed)
    co2_kg_saved = round(fate_risk_co2, 2) if is_fixed else 0.0
    
    # Predicted fix
    predicted_fix = metadata.get("predicted_fix", "Assessment and remediation required")
    predicted_fix_confidence = round(random.uniform(0.65, 0.90), 3)
    
    # Evidence IDs (random similar issues)
    num_evidence = random.randint(2, 5)
    evidence_ids = [f"issue_{uuid.uuid4().hex[:12]}" for _ in range(num_evidence)]
    
    # Auto review flag
    auto_review_flag = any([di["auto_review_flag"] for di in detected_issues])
    
    # Upvotes and reports
    if status == "open":
        upvotes_open = random.randint(1, 50)
        upvotes_closed = 0
        reports_open = random.randint(0, 15)
        reports_closed = 0
    else:
        upvotes_open = random.randint(5, 50)
        upvotes_closed = random.randint(10, 100)
        reports_open = random.randint(0, 15)
        reports_closed = random.randint(0, 8)
    
    # Spam flag
    is_spam = (status == "open" and reports_open > 10) or (status == "closed" and reports_closed > 10)
    
    # Generate text embedding
    text_blob = f"{description} {auto_caption} {' '.join([di['type'] for di in detected_issues])} {predicted_fix}"
    text_embedding = generate_embedding(text_blob)
    
    issue_doc = {
        "issue_id": issue_id,
        "reported_by": reported_by,
        "uploader_display_name": display_name,
        "source": source,
        "status": status,
        "closed_by": closed_by,
        "closed_at": closed_at.isoformat() if closed_at else None,
        "created_at": created_at.isoformat(),
        "updated_at": updated_at.isoformat(),
        "location": location,
        "description": description,
        "text_embedding": text_embedding,
        "auto_caption": auto_caption,
        "user_selected_labels": user_selected_labels_choice,
        "photo_url": photo_url,
        "detected_issues": detected_issues,
        "issue_types": issue_types_list,
        "label_confidences": label_confidences,
        "severity_score": round(severity_score, 2),
        "fate_risk_co2": fate_risk_co2,
        "co2_kg_saved": co2_kg_saved,
        "predicted_fix": predicted_fix,
        "predicted_fix_confidence": predicted_fix_confidence,
        "evidence_ids": evidence_ids,
        "auto_review_flag": auto_review_flag,
        "upvotes": {
            "open": upvotes_open,
            "closed": upvotes_closed
        },
        "reports": {
            "open": reports_open,
            "closed": reports_closed
        },
        "is_spam": is_spam
    }
    
    return issue_doc


def generate_fix_document(
    issue_doc: Dict,
    fix_image_urls: List[str]
) -> Dict:
    """Generate a fix document for a closed issue."""
    
    fix_id = f"fix_{uuid.uuid4().hex[:12]}"
    issue_id = issue_doc["issue_id"]
    
    # NGO info
    created_by = issue_doc["closed_by"]
    created_at = datetime.fromisoformat(issue_doc["closed_at"])
    
    # Description
    issue_types = issue_doc["issue_types"]
    fix_descriptions = [
        f"Successfully resolved {', '.join(issue_types)} issue through systematic intervention",
        f"Completed remediation of {issue_types[0]} with proper materials and techniques",
        f"Fixed {', '.join(issue_types)} ensuring long-term sustainability",
        f"Addressed {issue_types[0]} issue with community cooperation"
    ]
    description = random.choice(fix_descriptions)
    
    # Photo count
    photo_count = len(fix_image_urls)
    
    # CO2 saved
    co2_saved = issue_doc["fate_risk_co2"]
    
    # Success rate
    success_rate = round(random.uniform(0.60, 1.0), 2)
    
    # Related issue types
    related_issue_types = issue_types.copy()
    
    # Fix outcomes
    fix_outcomes = []
    for issue_type in issue_types:
        # Based on success rate, determine if fixed
        if success_rate >= 0.8:
            fixed = "Yes"
            confidence = round(random.uniform(0.80, 0.98), 3)
            notes = random.choice([
                f"{issue_type} fully resolved with quality materials",
                f"Complete fix achieved for {issue_type}",
                f"{issue_type} successfully addressed meeting standards"
            ])
        else:
            fixed = "No"
            confidence = round(random.uniform(0.40, 0.79), 3)
            notes = random.choice([
                f"{issue_type} partially addressed, monitoring required",
                f"Some improvement in {issue_type} but needs follow-up",
                f"{issue_type} work completed but effectiveness uncertain"
            ])
        
        fix_outcomes.append({
            "issue_type": issue_type,
            "fixed": fixed,
            "confidence": confidence,
            "notes": notes
        })
    
    # Text embedding
    text_blob = f"{description} {' '.join(related_issue_types)} CO2 saved: {co2_saved} kg Success rate: {success_rate}"
    text_embedding = generate_embedding(text_blob)
    
    # Source doc IDs (same as evidence from issue)
    source_doc_ids = issue_doc.get("evidence_ids", [])
    
    fix_doc = {
        "fix_id": fix_id,
        "issue_id": issue_id,
        "created_by": created_by,
        "created_at": created_at.isoformat(),
        "description": description,
        "image_urls": fix_image_urls,
        "photo_count": photo_count,
        "co2_saved": co2_saved,
        "success_rate": success_rate,
        "related_issue_types": related_issue_types,
        "fix_outcomes": fix_outcomes,
        "text_embedding": text_embedding,
        "source_doc_ids": source_doc_ids
    }
    
    return fix_doc


def seed_elasticsearch(image_urls_file: str = "civicfix_image_urls.json"):
    """Main function to seed Elasticsearch with issues and fixes."""
    
    print("🚀 Starting Elasticsearch Seeding Process")
    print("=" * 60)
    
    # Load image URLs
    print("\n📂 Loading image URLs...")
    with open(image_urls_file, 'r') as f:
        data = json.load(f)
    
    image_data = data['data']
    print(f"✅ Loaded data for {len(image_data)} issue types")
    
    # Create ES client
    print("\n🔌 Connecting to Elasticsearch...")
    es = create_es_client()
    
    try:
        info = es.info()
        print(f"✅ Connected to Elasticsearch")
        print(f"   Cluster: {info['cluster_name']}")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        return
    
    # Tracking
    issues_created = 0
    fixes_created = 0
    errors = 0
    
    print("\n📝 Generating and inserting documents...")
    print("-" * 60)
    
    # Process each issue type
    for issue_type, urls in image_data.items():
        issue_urls = urls.get("issues", [])
        fix_urls = urls.get("fixes", [])
        
        print(f"\n🔧 Processing {issue_type}:")
        print(f"   Issues: {len(issue_urls)}, Fixes available: {len(fix_urls)}")
        
        # Check if this issue type has specific fix assignments
        if issue_type in FIXES_ASSIGNMENTS:
            assignment = FIXES_ASSIGNMENTS[issue_type]
            num_to_fix = assignment["num_issues"]
            fixes_per = assignment["fixes_per_issue"]
            
            print(f"   ⭐ Special assignment: {num_to_fix} issues will have fixes")
            
            # Select which issues to fix
            issues_to_fix_indices = random.sample(range(len(issue_urls)), min(num_to_fix, len(issue_urls)))
            
            for idx, issue_url in enumerate(issue_urls):
                if idx in issues_to_fix_indices:
                    # Create fixed issue
                    fix_date = generate_random_date(6, 1)
                    issue_doc = generate_issue_document(issue_type, issue_url, is_fixed=True, fix_date=fix_date)
                    
                    # Determine how many fix images to use
                    if isinstance(fixes_per, list):
                        num_fix_images = random.randint(*fixes_per)
                    else:
                        num_fix_images = fixes_per
                    
                    # Get fix URLs
                    if fix_urls:
                        selected_fix_urls = random.sample(fix_urls, min(num_fix_images, len(fix_urls)))
                    else:
                        selected_fix_urls = []
                    
                    # Insert issue
                    try:
                        es.index(index="issues", id=issue_doc["issue_id"], document=issue_doc)
                        issues_created += 1
                        print(f"      ✅ Issue {issue_doc['issue_id'][:20]}... (FIXED)")
                    except Exception as e:
                        print(f"      ❌ Failed to insert issue: {e}")
                        errors += 1
                        continue
                    
                    # Create and insert fix
                    if selected_fix_urls:
                        fix_doc = generate_fix_document(issue_doc, selected_fix_urls)
                        try:
                            es.index(index="fixes", id=fix_doc["fix_id"], document=fix_doc)
                            fixes_created += 1
                            print(f"      ✅ Fix {fix_doc['fix_id'][:20]}... ({len(selected_fix_urls)} images)")
                        except Exception as e:
                            print(f"      ❌ Failed to insert fix: {e}")
                            errors += 1
                else:
                    # Create open issue
                    issue_doc = generate_issue_document(issue_type, issue_url, is_fixed=False)
                    
                    try:
                        es.index(index="issues", id=issue_doc["issue_id"], document=issue_doc)
                        issues_created += 1
                        print(f"      ✅ Issue {issue_doc['issue_id'][:20]}... (OPEN)")
                    except Exception as e:
                        print(f"      ❌ Failed to insert issue: {e}")
                        errors += 1
        
        else:
            # No fixes for this issue type - all open issues
            for issue_url in issue_urls:
                issue_doc = generate_issue_document(issue_type, issue_url, is_fixed=False)
                
                try:
                    es.index(index="issues", id=issue_doc["issue_id"], document=issue_doc)
                    issues_created += 1
                    print(f"      ✅ Issue {issue_doc['issue_id'][:20]}... (OPEN)")
                except Exception as e:
                    print(f"      ❌ Failed to insert issue: {e}")
                    errors += 1
    
    # Summary
    print("\n" + "=" * 60)
    print("🎉 Seeding Completed!")
    print("=" * 60)
    print(f"📊 Summary:")
    print(f"   ✅ Issues created: {issues_created}")
    print(f"   ✅ Fixes created: {fixes_created}")
    print(f"   ❌ Errors: {errors}")
    print(f"   📈 Success rate: {((issues_created + fixes_created) / (issues_created + fixes_created + errors) * 100):.1f}%")
    
    # Verify indices
    print("\n📊 Index Statistics:")
    try:
        issues_count = es.count(index="issues")["count"]
        fixes_count = es.count(index="fixes")["count"]
        print(f"   Issues index: {issues_count} documents")
        print(f"   Fixes index: {fixes_count} documents")
    except Exception as e:
        print(f"   ❌ Could not retrieve counts: {e}")


if __name__ == "__main__":
    seed_elasticsearch()
