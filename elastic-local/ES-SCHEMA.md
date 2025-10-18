
---
# CivicFix Elasticsearch Schema Reference

This document describes the Elasticsearch index mappings for the CivicFix platform. These schemas define the structure of the `issues` and `fixes` indices, including all field types and comments for each property.

---

## `issues` Index Mapping

```jsonc
PUT /issues
{
	"mappings": {
		"properties": {
			"issue_id": {"type":"keyword"},
			"reported_by": {"type":"keyword"},     /* firebase uid or "anonymous" token */
			"uploader_display_name": {"type":"keyword"},
			"source": {"type":"keyword"},          /* citizen | anonymous  */
			"status": {"type":"keyword"},          /* open | verified | closed */

			"locked_by": {"type":"keyword"},       /* ngo_id if locked/claimed */
			"locked_at": {"type":"date"},
			"verified_by": {"type":"keyword"},
			"verified_at": {"type":"date"},
			"closed_by": {"type":"keyword"},
			"closed_at": {"type":"date"},
			"reported_at": {"type":"date"},
			"created_at": {"type":"date"},
			"updated_at": {"type":"date"},
			"location": {"type":"geo_point"},
			"description": {"type":"text"},

			"text_embedding": {"type":"dense_vector","dims":1536},  /*for hybrid retrieval */

			"auto_caption": {"type":"text"},			 /* gemini generated issue lables */
			"user_selected_labels": {"type":"keyword"},  /*array user picked from dropdown */
			"photo_url": {"type":"keyword"},
			"detected_issues": {
				"type":"nested",
				"properties": {
					"type": {"type":"keyword"},
					"confidence": {"type":"float"},
					"severity": {"type":"keyword"},        /* low | medium | high */
					"severity_score": {"type":"float"},   /* 0-10 */
					"future_impact": {"type":"text"},
					"predicted_fix": {"type":"text"},
					"predicted_fix_confidence": {"type":"float"},
					"auto_review_flag": {"type":"boolean"},
					"reason_for_flag": {"type":"text"}
				}
			},
			"issue_types": {"type":"keyword"},   /*flattened unique set of confirmed types */
			/* a small map of label -> confidence for quick access */
			"label_confidences": {"type":"object","dynamic": true},
			"severity_score": {"type":"float"},    /* aggregated doc-level 0-10 */
			"fate_risk_co2": {"type":"float"},
			"co2_kg_saved": {"type":"float"},
			"predicted_fix": {"type":"text"},
			"predicted_fix_confidence": {"type":"float"},
			"evidence_ids": {"type":"keyword"},    /* ES doc ids used as context */
			/* lightweight provenance flags */
			"auto_review_flag":{"type":"boolean"},    /*true if any detected issue needs NGO review */
			"human_verified": {"type":"boolean"},
			"reviewed_by": {"type":"keyword"},
			"reviewed_at": {"type":"date"},
			"upvotes": {
				"properties": {
					"open": { "type": "integer" },
					"verified": { "type": "integer" },
					"closed": { "type": "integer" }
				}
			},
			"reports": {
				"properties": {
					"open": { "type": "integer" },
					"verified": { "type": "integer" },
					"closed": { "type": "integer" }
				}
			},
			"impact_score": {"type":"float"},
			"visibility_radius_m": {"type":"integer"},
			/* Weather snapshot at time of report - useful for reasoning and audits */
			"weather": {
				"properties": {
					"precipitation_24h_mm": {"type":"float"},
					"temperature_c_avg": {"type":"float"},
					"windspeed_max_ms": {"type":"float"},
					"relative_humidity_avg": {"type":"float"},
					"snowfall_24h_mm": {"type":"float"},
					"weather_note": {"type":"text"}
				}
			}
		}
	}
}
```

---

## `fixes` Index Mapping

```jsonc
PUT /fixes
{
	"mappings": {
		"properties": {
			"fix_id": {"type":"keyword"},
			"issue_id": {"type":"keyword"},
			"created_by": {"type":"keyword"},
			"created_at": {"type":"date"},
			"title": {"type":"text"},
			"summary": {"type":"text"},
			"transcript": {"type":"text"},
			"video_url": {"type":"keyword"},
			"co2_saved": {"type":"float"},
			"success_rate": {"type":"float"},           /* 0.0-1.0 */
			"city": {"type":"keyword"},
			"related_issue_types": {"type":"keyword"},
			"text_embedding": {"type":"dense_vector","dims":1536},
			"source_doc_ids": {"type":"keyword"}
		}
	}
}
```