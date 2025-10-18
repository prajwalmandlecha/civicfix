# Cloud SQL Proxy: Docker Quick Start

This guide explains how to securely start the Google Cloud SQL Auth Proxy using Docker, so your backend can connect to your Cloud SQL instance on `localhost:5433`.

## Prerequisites

- Docker installed
- Google Cloud service account key (JSON file)
- Your Cloud SQL instance connection name (e.g., `civicfix-474613:asia-south1:civicfix-database`)

## 1. Build the Docker Image

From this directory:

```powershell
docker build -t cloud-sql-proxy .
```

## 2. Start the Proxy Container


# Remove any existing container (optional)
```powershell
docker rm -f cloud-sql-proxy
```

# Start the proxy, mapping port 5433, mounting the key, and setting the env variable
```powershell
docker run -d --name cloud-sql-proxy -p 5433:5433 -v C:/Users/acer/Desktop/civicfix/secrets/civicfix-474613-613212b7d832.json:/sa-key.json:ro -e GOOGLE_APPLICATION_CREDENTIALS=/sa-key.json cloud-sql-proxy
```

## 3. How It Works

- The container runs the Cloud SQL Proxy using your service account for authentication.
- The proxy listens on `localhost:5433` and forwards connections to your Cloud SQL instance.
- Your backend connects to the database at `localhost:5433` as if it were local.

## 4. Troubleshooting

- If the container stops, check logs:
	```powershell
	docker logs cloud-sql-proxy
	```
- Ensure the key file path and instance name are correct.

## 5. Security Notes

- Never commit your service account key to source control or bake it into Docker images.
- For GCP deployment, use Workload Identity or attach a service account directly (no key file needed).

## References

- [Cloud SQL Auth Proxy Documentation](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy)
