from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./hoa_tracker.db")

if DATABASE_URL.startswith("postgresql"):
    # Production: PostgreSQL
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    # Development: SQLite
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()