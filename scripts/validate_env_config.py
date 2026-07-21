#!/usr/bin/env python3
"""
Part E: Environment Configuration Validation
Validates .env file has all required variables
"""

import os
import sys
from pathlib import Path

def load_env_example():
    """Load required variables from .env.example"""
    env_example_path = Path(__file__).parent.parent / '.env.example'
    required_vars = {}

    if not env_example_path.exists():
        print("⚠️  .env.example not found, using defaults")
        return {
            'DATABASE_URL': None,
            'FLASK_SECRET_KEY': None,
            'BREVO_API_KEY': None,
            'BREVO_SENDER_EMAIL': None,
        }

    with open(env_example_path, 'r') as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key = line.split('=')[0].strip()
                required_vars[key] = None

    return required_vars

def check_env_file():
    """Check if .env file exists"""
    env_path = Path(__file__).parent.parent / '.env'

    if env_path.exists():
        print("  ✓ .env file exists")
        return True
    else:
        print("  ⚠️  .env file not found")
        print("     Run: cp .env.example .env")
        return False

def validate_env_variables():
    """Validate all required environment variables are set"""
    # Variables that are truly required for local development
    required_vars = ['DATABASE_URL', 'SECRET_KEY']
    # Variables that are optional (email, AI features)
    optional_vars = ['BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
                     'GEMINI_API_KEY', 'ADMIN_EMAIL']

    missing = []
    present = []
    optional_missing = []

    for var_name in required_vars:
        value = os.getenv(var_name)
        if value and value.strip():
            present.append(var_name)
        else:
            missing.append(var_name)

    for var_name in optional_vars:
        value = os.getenv(var_name)
        if value and value.strip():
            present.append(var_name)
        else:
            optional_missing.append(var_name)

    return present, missing, optional_missing

def main():
    print("=== Part E: Environment Configuration Validation ===\n")

    print("Checking environment configuration...")

    has_env_file = check_env_file()
    print("")

    # Load from .env file if it exists
    if has_env_file:
        from dotenv import load_dotenv
        env_path = Path(__file__).parent.parent / '.env'
        load_dotenv(env_path)

    print("Validating environment variables...")
    present, missing, optional_missing = validate_env_variables()

    for var in present:
        # Mask sensitive values
        value = os.getenv(var)
        if len(value) > 20:
            value = value[:20] + "..."
        print(f"  ✓ {var} = {value}")

    if missing:
        print(f"\n❌ CRITICAL - Missing required variables: {', '.join(missing)}")
        print("\n   Edit .env and set these variables:")
        print("   - DATABASE_URL: PostgreSQL or SQLite connection string")
        print("   - SECRET_KEY: Random secret for JWT signing")
        return False

    if optional_missing:
        print(f"\n⚠️  Optional variables not set: {', '.join(optional_missing)}")
        print("   For full functionality, configure:")
        print("   - BREVO_API_KEY: For email delivery (password reset, notices)")
        print("   - GEMINI_API_KEY: For AI-drafted violation letters")
        print("   - ADMIN_EMAIL: Bootstrap admin account")
        print("\n   ℹ️  Local development works without these for now.")

    print("\n✅ Part E: Environment configuration validation PASSED")
    return True

if __name__ == '__main__':
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Validation error: {e}")
        sys.exit(1)
