#!/usr/bin/env python3
"""
Part B Enhanced: Database + Schema with User Flow Testing
Tests SQLAlchemy ORM, database driver, schema compatibility, and basic user flow
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine, Base, SessionLocal
from models import User, HOA, Resident, Violation
from sqlalchemy import text, inspect
import traceback

def test_database_connectivity():
    """Test database connectivity"""
    print("Step 1: Testing database connectivity...")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("  ✓ Database connection successful")
        return True
    except Exception as e:
        print(f"  ✗ Database connection failed: {e}")
        return False

def test_schema_creation():
    """Create schema tables"""
    print("\nStep 2: Creating schema tables...")
    try:
        Base.metadata.create_all(bind=engine)

        inspector = inspect(engine)
        tables = inspector.get_table_names()

        required_tables = ['users', 'hoas', 'residents', 'violations']
        missing = [t for t in required_tables if t not in tables]

        if missing:
            print(f"  ✗ Missing tables: {', '.join(missing)}")
            return False

        for table in required_tables:
            print(f"  ✓ Table '{table}' exists")
        return True
    except Exception as e:
        print(f"  ✗ Schema creation failed: {e}")
        traceback.print_exc()
        return False

def test_user_flow():
    """Test basic user creation and HOA flow"""
    print("\nStep 3: Testing user flow (create user → HOA → resident)...")

    try:
        session = SessionLocal()

        # Clean up test data first
        session.query(User).filter(User.email == "test@example.com").delete()
        session.commit()

        # Test 1: Create a user
        test_user = User(
            email="test@example.com",
            hashed_password="hashed_test_password_123"
        )
        session.add(test_user)
        session.commit()
        print("  ✓ User created successfully")

        # Verify user was stored
        retrieved_user = session.query(User).filter(User.email == "test@example.com").first()
        if not retrieved_user:
            print("  ✗ User retrieval failed")
            return False
        print("  ✓ User retrieved from database")

        # Test 2: Create HOA for user
        test_hoa = HOA(
            name="Test Association",
            address="123 Test St, Test City",
            email="hoa@test.com",
            user_id=test_user.id
        )
        session.add(test_hoa)
        session.commit()
        print("  ✓ HOA created successfully")

        # Test 3: Create resident
        test_resident = Resident(
            hoa_id=test_hoa.id,
            unit="101",
            name="Test Resident"
        )
        session.add(test_resident)
        session.commit()
        print("  ✓ Resident created successfully")

        # Test 4: Create violation
        test_violation = Violation(
            hoa_id=test_hoa.id,
            resident_id=test_resident.id,
            violation_type="Pet Policy",
            description="Test violation for validation",
            status="open",
            priority="medium"
        )
        session.add(test_violation)
        session.commit()
        print("  ✓ Violation created successfully")

        # Clean up test data
        session.query(Violation).filter(Violation.id == test_violation.id).delete()
        session.query(Resident).filter(Resident.id == test_resident.id).delete()
        session.query(HOA).filter(HOA.id == test_hoa.id).delete()
        session.query(User).filter(User.id == test_user.id).delete()
        session.commit()
        print("  ✓ Test data cleaned up")

        session.close()
        return True

    except Exception as e:
        print(f"  ✗ User flow test failed: {e}")
        traceback.print_exc()
        try:
            session.rollback()
            session.close()
        except:
            pass
        return False

def main():
    print("=== Part B: Database + Schema (Enhanced) ===\n")

    if not test_database_connectivity():
        print("\n❌ Database connectivity FAILED")
        return False

    if not test_schema_creation():
        print("\n❌ Schema creation FAILED")
        return False

    if not test_user_flow():
        print("\n❌ User flow test FAILED")
        return False

    print("\n✅ Part B (Enhanced): Database and user flow PASSED")
    return True

if __name__ == '__main__':
    success = main()
    sys.exit(0 if success else 1)
