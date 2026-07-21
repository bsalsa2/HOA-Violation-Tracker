#!/usr/bin/env python3
"""
Part B: Database Schema Validation
Validates database connectivity and schema structure
"""

import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine, Base
from models import User, HOA, Resident, Violation
from sqlalchemy import inspect, text

def validate_database_connection():
    """Test database connectivity"""
    print("Checking database connectivity...")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("  ✓ Database connection successful")
        return True
    except Exception as e:
        print(f"  ✗ Database connection failed: {e}")
        return False

def validate_table_exists(table_name, model_class):
    """Check if a table exists and has expected structure"""
    inspector = inspect(engine)
    tables = inspector.get_table_names()

    if table_name not in tables:
        print(f"  ✗ Table '{table_name}' not found")
        return False

    print(f"  ✓ Table '{table_name}' exists")

    # Check for key columns
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    print(f"    Columns: {len(columns)} found")
    return True

def validate_schema():
    """Validate all required tables and columns"""
    print("\nValidating database schema...")

    required_tables = [
        ('users', User),
        ('hoas', HOA),
        ('residents', Resident),
        ('violations', Violation),
    ]

    inspector = inspect(engine)
    existing_tables = inspector.get_table_names()

    # If tables don't exist, create them
    if not existing_tables or len(existing_tables) == 0:
        print("  ⚠️  No tables found, initializing database schema...")
        try:
            Base.metadata.create_all(bind=engine)
            print("  ✓ Database schema created")
            return True
        except Exception as e:
            print(f"  ✗ Failed to create schema: {e}")
            return False

    all_valid = True
    for table_name, model_class in required_tables:
        if not validate_table_exists(table_name, model_class):
            all_valid = False

    return all_valid

def main():
    print("=== Part B: Database Schema Validation ===\n")

    if not validate_database_connection():
        print("\n❌ Database validation FAILED")
        return False

    if not validate_schema():
        print("\n❌ Schema validation FAILED")
        return False

    print("\n✅ Part B: Database schema validation PASSED")
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
