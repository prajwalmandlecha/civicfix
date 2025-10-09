from fastapi import FastAPI, Request, HTTPException, status
from firebase_admin import auth, credentials, initialize_app

cred = credentials.Certificate("serviceAccountKey.json")
default_app = initialize_app(cred)

app = FastAPI()

@app.middleware("http")
async def verify_firebase_token(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    
    id_token = auth_header.split("Bearer ")[1]
    try:
        decoded_token = auth.verify_id_token(id_token)
        print("Token verified successfully:", decoded_token)
        return decoded_token
    except Exception as e:
        print(f"Error verifying token: {e}")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

@app.get("/")
async def root():
    return {"message": "Hello World"}

