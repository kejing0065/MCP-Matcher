import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(
    title="Global Treasury Agent API (dev)",
    description="Lightweight dev server exposing health endpoint",
    version="dev",
)


# Use ALLOWED_ORIGINS env var for simple CORS in development
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Global Treasury Agent (dev)"}
