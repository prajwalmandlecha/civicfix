# CivicFix Media Upload Guide

This guide will help you set up a Python virtual environment, install dependencies, configure environment variables, run the FastAPI media upload server, and test the media upload endpoint from both PowerShell and WSL.

---

## 1. Create and Activate a Python Virtual Environment

### Windows (PowerShell):
```shell
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### WSL/Linux:
```bash
python3 -m venv .venv
source .venv/bin/activate
```

---

## 2. Install Python Requirements

```bash
pip install fastapi uvicorn python-multipart google-cloud-storage python-dotenv
```

---

## 3. Set Up Environment Variables

Create a `.env` file in the project root (if not already present) with the following variables:

```
GCS_BUCKET_NAME=your_gcs_bucket_name
GOOGLE_APPLICATION_CREDENTIALS=secrets/your-service-account.json
```
- Replace `your_gcs_bucket_name` with your actual Google Cloud Storage bucket name.
- Replace `your-service-account.json` with your GCP service account key file path.

---

## 4. Run the FastAPI Media Upload Server

### Windows (PowerShell):
```powershell
uvicorn media_upload:app --reload --host 0.0.0.0 --port 8080
```

### WSL/Linux:
```bash
uvicorn media_upload:app --reload --host 0.0.0.0 --port 8080
```

---

## 5. Test the Media Upload Endpoint

### PowerShell (use full path to curl.exe):
```powershell
& "C:\Windows\System32\curl.exe" -X POST "http://127.0.0.1:8080/upload" -F "file=@your_media.png"
```

### WSL (find your Windows host IP):
First, get your Windows host IP:
```bash
/sbin/ip route | awk '/default/ { print $3 }'
```
Suppose it returns `192.168.160.1`, then run:
```bash
curl -X POST "http://192.168.160.1:8080/upload" -F "file=@your_media.png"
```

---

## 6. Notes
- Make sure your GCS bucket exists and your credentials are valid.
- The uploaded media's public URL will be returned in the response JSON.
- For troubleshooting, check the FastAPI server logs for errors.

---

## 7. Example Response
```
{"object_name":"uploads/xxxx.png","public_url":"https://storage.googleapis.com/your_gcs_bucket/uploads/xxxx.png"}
```

---
