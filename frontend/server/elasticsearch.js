import { Client } from '@elastic/elasticsearch';

const client = new Client({
  node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200'
});

const INDEX_NAME = 'civicfix-issues';

export async function getMapClusters(params) {
  const {
    zoom = 10,
    bounds,
    filters = {}
  } = params;

  const precision = Math.max(1, Math.min(12, Math.floor(zoom)));

  const mustClauses = [];

  if (bounds) {
    mustClauses.push({
      geo_bounding_box: {
        location: {
          top_left: {
            lat: bounds.north,
            lon: bounds.west
          },
          bottom_right: {
            lat: bounds.south,
            lon: bounds.east
          }
        }
      }
    });
  }

  if (filters.status && filters.status.length > 0) {
    mustClauses.push({
      terms: { status: filters.status }
    });
  }

  if (filters.issue_type && filters.issue_type.length > 0) {
    mustClauses.push({
      terms: { issue_type: filters.issue_type }
    });
  }

  if (filters.source && filters.source.length > 0) {
    mustClauses.push({
      terms: { source: filters.source }
    });
  }

  if (filters.date_from || filters.date_to) {
    const dateRange = {};
    if (filters.date_from) dateRange.gte = filters.date_from;
    if (filters.date_to) dateRange.lte = filters.date_to;
    mustClauses.push({
      range: { reported_at: dateRange }
    });
  }

  const query = mustClauses.length > 0 ? { bool: { must: mustClauses } } : { match_all: {} };

  if (zoom < 12) {
    const response = await client.search({
      index: INDEX_NAME,
      body: {
        size: 0,
        query,
        aggs: {
          grid: {
            geotile_grid: {
              field: 'location',
              precision: precision,
              size: 10000
            },
            aggs: {
              centroid: {
                geo_centroid: {
                  field: 'location'
                }
              },
              issue_types: {
                terms: {
                  field: 'issue_type',
                  size: 20
                }
              },
              total_upvotes: {
                sum: {
                  field: 'upvotes'
                }
              },
              total_co2_saved: {
                sum: {
                  field: 'co2_kg_saved'
                }
              },
              total_fate_risk: {
                sum: {
                  field: 'fate_risk_co2'
                }
              }
            }
          }
        }
      }
    });

    const clusters = response.aggregations.grid.buckets.map(bucket => ({
      type: 'cluster',
      id: bucket.key,
      coordinates: [
        bucket.centroid.location.lon,
        bucket.centroid.location.lat
      ],
      count: bucket.doc_count,
      issue_types: bucket.issue_types.buckets.map(t => ({
        type: t.key,
        count: t.doc_count
      })),
    total_co2_saved: bucket.total_co2_saved.value,
    total_fate_risk: bucket.total_fate_risk.value,
    total_upvotes: bucket.total_upvotes.value,
    }));

    return {
      type: 'clusters',
      features: clusters
    };
  } else {
    const response = await client.search({
      index: INDEX_NAME,
      body: {
        size: 1000,
        query,
        _source: [
          'issue_id',
          'location',
          'issue_type',
          'status',
          'upvotes',
          'reported_at',
          'source',
          'description',
          'photo_url',
          'co2_kg_saved',
          'fate_risk_co2',
          'severity',
          'reports',
          'cross_city_fix',
        ]
      }
    });

    const points = response.hits.hits.map(hit => ({
      type: 'point',
      id: hit._source.issue_id,
      coordinates: [
        hit._source.location.lon,
        hit._source.location.lat
      ],
      properties: {
        ...hit._source,
        reported_at: hit._source.reported_at
      }
    }));

    return {
      type: 'points',
      features: points
    };
  }
}

export async function getIssueDetails(issueId) {
  try {
    const response = await client.search({
      index: INDEX_NAME,
      body: {
        query: {
          term: { issue_id: issueId }
        },
        size: 1
      }
    });

    if (response.hits.hits.length === 0) {
      return null;
    }

    return response.hits.hits[0]._source;
  } catch (error) {
    console.error('Error fetching issue details:', error);
    throw error;
  }
}

export async function checkConnection() {
  try {
    const health = await client.cluster.health();
    console.log('Elasticsearch connection established:', health.status);
    return true;
  } catch (error) {
    console.error('Elasticsearch connection failed:', error.message);
    return false;
  }
}

export { client };
