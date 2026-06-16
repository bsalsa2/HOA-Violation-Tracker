from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os

from config import get_settings
from database import Base, engine
from routers import auth, users, properties, violations, ai, reports

# Create all tables on startup
Base.metadata.create_all(bind=engine)

os.makedirs("uploads", exist_ok=True)

settings = get_settings()

app = FastAPI(
    title="HOA Violation Tracker API",
    description=(
        "A complete API for managing HOA violations, properties, residents, "
        "AI-powered analysis, and PDF reporting."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — tighten origins in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if settings.environment == "development" else [],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static file serving for uploaded images
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

# Routers
API_V1 = "/api/v1"
app.include_router(auth.router, prefix=API_V1)
app.include_router(users.router, prefix=API_V1)
app.include_router(properties.router, prefix=API_V1)
app.include_router(violations.router, prefix=API_V1)
app.include_router(ai.router, prefix=API_V1)
app.include_router(reports.router, prefix=API_V1)


@app.get("/", tags=["Health"])
def root():
    return {
        "service": "HOA Violation Tracker API",
        "version": "1.0.0",
        "status": "healthy",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    if settings.environment == "development":
        import traceback
        detail = traceback.format_exc()
    else:
        detail = "An unexpected error occurred"
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": detail},
    )
