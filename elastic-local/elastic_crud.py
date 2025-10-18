from elasticsearch import Elasticsearch
from datetime import datetime
import json

ES_URL = "http://localhost:9200"
INDEX_NAME = "civicfix-issues"

es = Elasticsearch(
    ES_URL,
    basic_auth=("elastic", ""),
    headers={"Accept": "application/vnd.elasticsearch+json;compatible-with=8"},
    request_timeout=30
)

def prompt_issue_fields():
    """Prompt user for all fields required to create an issue."""
    issue = {}
    issue["issue_id"] = input("issue_id (leave blank to auto-generate): ") or f"cf_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
    issue["location"] = {
        "lat": float(input("latitude: ")), "lon": float(input("longitude: "))
    }
    issue["issue_type"] = input("issue_type: ")
    issue["status"] = input("status: ")
    issue["severity"] = input("severity: ")
    issue["upvotes"] = int(input("upvotes: "))
    issue["reports"] = int(input("reports: "))
    issue["reported_at"] = input("reported_at (YYYY-MM-DDTHH:MM:SSZ, blank for now): ") or datetime.now().strftime('%Y-%m-%dT%H:%M:%SZ')
    issue["source"] = input("source: ")
    issue["description"] = input("description: ")
    issue["photo_url"] = input("photo_url: ")
    issue["cross_city_fix"] = input("cross_city_fix: ")
    issue["fate_risk_co2"] = float(input("fate_risk_co2: "))
    issue["co2_kg_saved"] = float(input("co2_kg_saved: "))
    return issue

def create_issue():
    issue = prompt_issue_fields()
    res = es.index(index=INDEX_NAME, id=issue["issue_id"], document=issue)
    print(f"Created issue with ID: {res['_id']}")

def get_issue():
    issue_id = input("Enter issue_id: ")
    try:
        res = es.get(index=INDEX_NAME, id=issue_id)
        print(json.dumps(res['_source'], indent=2))
    except Exception as e:
        print(f"Error: {e}")

def update_issue():
    issue_id = input("Enter issue_id to update: ")
    field = input("Field to update: ")
    value = input("New value: ")
    # Try to cast to int/float if possible
    try:
        value = int(value)
    except ValueError:
        try:
            value = float(value)
        except ValueError:
            pass
    try:
        res = es.update(index=INDEX_NAME, id=issue_id, doc={field: value})
        print(f"Update result: {res['result']}")
    except Exception as e:
        print(f"Error: {e}")

def delete_issue():
    issue_id = input("Enter issue_id to delete: ")
    try:
        res = es.delete(index=INDEX_NAME, id=issue_id)
        print(f"Delete result: {res['result']}")
    except Exception as e:
        print(f"Error: {e}")

def search_issues():
    field = input("Field to search: ")
    value = input("Value to match: ")
    query = {"match": {field: value}}
    res = es.search(index=INDEX_NAME, query=query, size=10)
    for hit in res['hits']['hits']:
        print(json.dumps(hit['_source'], indent=2))

def main():
    while True:
        print("\nChoose operation:")
        print("1. Create issue")
        print("2. Get issue by ID")
        print("3. Update issue field")
        print("4. Delete issue")
        print("5. Search issues")
        print("6. Exit")
        choice = input("Enter choice: ")
        if choice == "1":
            create_issue()
        elif choice == "2":
            get_issue()
        elif choice == "3":
            update_issue()
        elif choice == "4":
            delete_issue()
        elif choice == "5":
            search_issues()
        elif choice == "6":
            break
        else:
            print("Invalid choice.")

if __name__ == "__main__":
    main()
