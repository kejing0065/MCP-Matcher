from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import tools, reconcile

app = FastAPI(
    title="Global Treasury Agent API",
    description="Cross-border payment reconciliation for Malaysian SMEs",
    version="1.0.0",
)

# CORS — explicit Next.js dev origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tools.router, prefix="/tools", tags=["MCP Tools"])
app.include_router(reconcile.router, prefix="/reconcile", tags=["Reconciliation"])


@app.get("/health")
async def health():
    return {"status": "ok", "service": "Global Treasury Agent"}
