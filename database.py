from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# Load a local .env file if present (used for local development on a laptop;
# hosted platforms like Railway inject env vars directly so this is a no-op there).
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hoa_tracker.db")

if DATABASE_URL.startswith("postgres"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://").replace("postgresql://", "postgresql+psycopg2://", 1)
    engine = create_engine(DATABASE_URL)
else:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()
