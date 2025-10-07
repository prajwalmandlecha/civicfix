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
    "https://www.youtube.com/watch?v=2l6kG1b1bXw",  # pothole fix
    "https://www.youtube.com/watch?v=1w7OgIMMRc4",  # garbage fix
    "https://www.youtube.com/watch?v=Q8Q8Q8Q8Q8Q",  # streetlight fix
    "https://www.youtube.com/watch?v=3Q8zTVlD7yY",  # drain fix
    "https://www.youtube.com/watch?v=R9R9R9R9R9R"   # construction fix
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
                "issue_type": {"type": "keyword"},
                "status": {"type": "keyword"},
                "severity": {"type": "keyword"},
                "description": {"type": "text"},
                "reported_at": {"type": "date"},
                "source": {"type": "keyword"},
                "location": {"type": "geo_point"},
                "photo_url": {"type": "keyword"},
                "cross_city_fix": {"type": "keyword"},
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
            itype = random.choice(TYPES)
            status = random.choice(STATUSES)
            source = random.choice(SOURCES)
            upvotes = random.randint(1, 42)
            severity = random.choice(["low", "medium", "high"])
            reports = random.randint(0, 10)
            risk = round(random.uniform(5, 50), 1)
            saved = 0 if status != "closed" else risk
            idx = TYPES.index(itype)
            photo_url = PHOTOS[idx]
            fix_url = FIXES[idx]
            issue_id = f"cf_{datetime.now().strftime('%Y%m%d')}_{i:03d}"

            yield {
                "_index": INDEX_NAME,
                "_id": issue_id,
                "_source": {
                    "issue_id": issue_id,
                    "location": {"lat": lat, "lon": lon},
                    "issue_type": itype,
                    "status": status,
                    "severity": severity,
                    "upvotes": upvotes,
                    "reports": reports,
                    "reported_at": (datetime.now(timezone.utc) - timedelta(days=random.randint(0, 30))).strftime('%Y-%m-%dT%H:%M:%SZ'),
                    "source": source,
                    "description": f"Big {itype} near {random.choice(['bus stop', 'market', 'school', 'junction'])}",
                    "photo_url": photo_url,
                    "cross_city_fix": fix_url,
                    "fate_risk_co2": risk,
                    "co2_kg_saved": saved
                }
            }

    # 3. Bulk ingest
    helpers.bulk(es, docs())
    print(f"✅ {BATCH} dummy issues indexed to {INDEX_NAME}")

if __name__ == "__main__":
    seed()