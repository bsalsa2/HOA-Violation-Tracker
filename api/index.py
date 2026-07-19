"""Vercel serverless entry point.

Vercel's Python runtime looks for an ASGI `app` in api/. The real app lives
at the repo root, so put the root on sys.path and re-export it.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app  # noqa: E402,F401
