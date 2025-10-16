from datetime import datetime, timedelta, timezone
from elasticsearch import Elasticsearch, helpers
import random, string

ES_URL      = "http://localhost:9200"
INDEX_NAME  = "civicfix-issues"
BATCH       = 500
BBOX        = {"min_lat": 12.8, "max_lat": 13.2, "min_lon": 77.4, "max_lon": 77.8}

TYPES   = ["pothole", "garbage", "streetlight", "drain", "construction"]
STATUSES = ["open", "verified", "closed"]
SOURCES  = ["citizen", "ngo", "anonymous"]

PHOTOS = [
    "https://as2.ftcdn.net/v2/jpg/00/18/81/81/1000_F_18818150_LW0PjRkjCsyxSVnzZavgkQFlYq77bBom.jpg",  # pothole
    "https://thumbs.dreamstime.com/b/garbage-problem-improperly-disposed-bags-litter-waste-42171351.jpg",  # garbage
    "https://www.shutterstock.com/image-photo/detail-shot-broken-street-lamp-600nw-334237046.jpg",  # streetlight
    "https://media.istockphoto.com/id/1069158396/photo/storm-drain-outflow-stormwater-water-drainage-waste-water-or-effluent.jpg?s=612x612&w=0&k=20&c=C2yq9Ya0z8ui-36r1PWNpAj7t9d-WHlCcri1tZ-WeWY=",  # drain
    "https://images.pexels.com/photos/439416/pexels-photo-439416.jpeg?_gl=1*1hxf1fr*_ga*Nzk1MjMzOTc5LjE3NTk4NTY3MTE.*_ga_8JE65Q40S6*czE3NTk4NTY3MTEkbzEkZzEkdDE3NTk4NTY3MTIkajU5JGwwJGgw",  # construction
]
FIXES = [
    "https://storage.googleapis.com/civicfix_issues_bucket/fix-videos/05a5d547e2f2476a9f7c3546054efd7a.mp4",  # pothole fix
    "https://storage.googleapis.com/civicfix_issues_bucket/fix-videos/594cddce5d6346ce9b05b32d98ba810e.mp4",  # garbage fix
    "https://storage.googleapis.com/civicfix_issues_bucket/fix-videos/725da224184a4cf8900ed25ec24efdc1.mp4",  # streetlight fix
    "https://storage.googleapis.com/civicfix_issues_bucket/fix-videos/bf7344355a024aaf80574b563d51ae35.mp4",  # drain fix
    "https://storage.googleapis.com/civicfix_issues_bucket/fix-videos/a3b5677921b64dd098fb6da31a747ecc.mp4"   # construction fix
]

es = Elasticsearch(
    ES_URL,
    basic_auth=("elastic", ""),   # empty when security=false
    headers={"Accept": "application/vnd.elasticsearch+json;compatible-with=8"},
    request_timeout=30
)

def seed():
    # 1. Create / recreate index
    mapping = {
        "mappings": {
            "properties": {
                "issue_id": {"type": "keyword"},
                "issue_types": {"type": "keyword"},  # will be an array of keywords
                "status": {"type": "keyword"},
                "severity": {"type": "object", "enabled": True, "dynamic": True},
                "future_impact": {"type": "object", "enabled": True, "dynamic": True},
                "severity_score": {"type": "float"},
                "description": {"type": "text"},
                "reported_at": {"type": "date"},
                "source": {"type": "keyword"},
                "location": {"type": "geo_point"},
                "photo_url": {"type": "keyword"},
                "cross_city_fix": {"type": "object", "enabled": True, "dynamic": True},
                "fate_risk_co2": {"type": "float"},
                "co2_kg_saved": {"type": "float"},
                "upvotes": {"type": "integer"},
                "reports": {"type": "integer"}
            }
        }
    }
    es.options(ignore_status=[400]).indices.create(index=INDEX_NAME, **mapping)

    # 2. Build bulk actions
    def docs():
        for i in range(1, BATCH + 1):
            lat = round(random.uniform(BBOX["min_lat"], BBOX["max_lat"]), 6)
            lon = round(random.uniform(BBOX["min_lon"], BBOX["max_lon"]), 6)
            # Pick 1-3 unique issue types
            n_types = random.randint(1, 3)
            issue_types = random.sample(TYPES, n_types)
            status = random.choice(STATUSES)
            source = random.choice(SOURCES)
            upvotes = random.randint(1, 42)
            reports = random.randint(0, 10)
            risk = round(random.uniform(5, 50), 1)
            saved = 0 if status != "closed" else risk
            photo_url = PHOTOS[TYPES.index(issue_types[0])]  # main photo for first type
            issue_id = f"cf_{datetime.now().strftime('%Y%m%d')}_{i:03d}"

            # Severity and future impact as per-type dicts
            severity = {itype: random.choice(["low", "medium", "high"]) for itype in issue_types}
            future_impact = {itype: f"If not fixed, {itype} may cause {random.choice(['accidents', 'health issues', 'traffic jams', 'waterlogging', 'power outages'])}." for itype in issue_types}
            severity_score = round(random.uniform(0, 10), 2)

            # Assign fix video URLs per issue type with 70% probability
            cross_city_fix = {}
            for itype in issue_types:
                if random.random() < 0.7:
                    cross_city_fix[itype] = FIXES[TYPES.index(itype)]

            doc = {
                "_index": INDEX_NAME,
                "_id": issue_id,
                "_source": {
                    "issue_id": issue_id,
                    "location": {"lat": lat, "lon": lon},
                    "issue_types": issue_types,
                    "status": status,
                    "severity": severity,
                    "future_impact": future_impact,
                    "severity_score": severity_score,
                    "upvotes": upvotes,
                    "reports": reports,
                    "reported_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 30))).strftime('%Y-%m-%dT%H:%M:%SZ'),
                    "source": source,
                    "description": f"Big {', '.join(issue_types)} near {random.choice(['bus stop', 'market', 'school', 'junction'])}",
                    "photo_url": photo_url,
                    "fate_risk_co2": risk,
                    "co2_kg_saved": saved
                }
            }
            if cross_city_fix:
                doc["_source"]["cross_city_fix"] = cross_city_fix
            yield doc

    # 3. Bulk ingest
    helpers.bulk(es, docs())
    print(f"✅ {BATCH} dummy issues indexed to {INDEX_NAME}")

if __name__ == "__main__":
    seed()