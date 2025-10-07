import express from 'express';
import cors from 'cors';
import { getMapClusters, getIssueDetails, checkConnection } from './elasticsearch.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/map-data', async (req, res) => {
  try {
    const zoom = parseFloat(req.query.zoom) || 10;
    const bounds = req.query.bounds ? JSON.parse(req.query.bounds) : null;
    const filters = req.query.filters ? JSON.parse(req.query.filters) : {};

    const data = await getMapClusters({
      zoom,
      bounds,
      filters
    });

    res.json(data);
  } catch (error) {
    console.error('Error fetching map data:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/issue/:id', async (req, res) => {
  try {
    const issue = await getIssueDetails(req.params.id);

    if (!issue) {
      return res.status(404).json({ error: 'Issue not found' });
    }

    res.json(issue);
  } catch (error) {
    console.error('Error fetching issue:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);

  const connected = await checkConnection();
  if (connected) {
    console.log('✓ Elasticsearch connection successful');
  } else {
    console.error('✗ Elasticsearch connection failed');
  }
});
