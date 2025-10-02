from fastapi import FastAPI
import firebase_admin


default_app = firebase_admin.initialize_app()

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Hello World"}

