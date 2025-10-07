# CivicFix Project Setup

This guide will help you start the CivicFix: Elasticsearch, backend API, and frontend app.

## 1. Start Elasticsearch (from the root directory)

Navigate to the `elastic-start-local` directory and run:

```sh
cd elastic-start-local
# (make sure Docker is running)
docker compose up -d
```

- This will start Elasticsearch on `localhost:9200`.

## 2. Start the Backend Server (API)

Navigate to the backend server directory inside the frontend folder:

```sh
cd ../frontend/server
npm install  # Only needed the first time or after dependency changes
npm start
```

- This will start the backend API (typically on `localhost:3001`).

## 3. Start the Frontend

Open a new terminal and run:

```sh
cd ../
npm install  # Only needed the first time or after dependency changes
npm run dev
```

- This will start the frontend (typically on `localhost:5173` or similar).

---

## Notes
- Make sure Docker is running before starting Elasticsearch.
- If you need to seed data, use the provided `seed.py` script.
- You can stop all services with `docker compose down` in the `elastic-start-local` directory and by stopping the backend and frontend servers in their respective terminals.