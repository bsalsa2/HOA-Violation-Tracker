from decimal import Decimal
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
import google.generativeai as genai

from auth import get_current_user, require_board_or_admin
from config import get_settings
from models import User, Violation, Property
from database import get_db
from schemas import AIAnalysisRequest, AIAnalysisResponse, ViolationResponse, ViolationSeverity
from sqlalchemy.orm import Session, joinedload

router = APIRouter(prefix="/ai", tags=["AI Analysis"])

SEVERITY_FINE_MAP = {
    ViolationSeverity.low: Decimal("50.00"),
    ViolationSeverity.medium: Decimal("150.00"),
    ViolationSeverity.high: Decimal("350.00"),
    ViolationSeverity.critical: Decimal("750.00"),
}

SYSTEM_PROMPT = """You are an expert HOA (Homeowners Association) compliance officer.
Analyze violation reports and provide structured assessments.

Your response must follow this exact format:
SEVERITY: <low|medium|high|critical>
FINE: <dollar amount as a number, e.g. 150.00>
ANALYSIS: <2-3 sentence analysis of the violation>
ACTIONS:
- <action 1>
- <action 2>
- <action 3>

Be objective, fair, and base your assessment on common HOA standards."""


def _parse_ai_response(text: str) -> tuple[str, ViolationSeverity, Decimal, List[str]]:
    lines = text.strip().splitlines()
    severity = ViolationSeverity.medium
    fine = Decimal("150.00")
    analysis = ""
    actions: List[str] = []
    in_actions = False
    analysis_lines: List[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.upper().startswith("SEVERITY:"):
            raw = stripped.split(":", 1)[1].strip().lower()
            try:
                severity = ViolationSeverity(raw)
            except ValueError:
                severity = ViolationSeverity.medium
        elif stripped.upper().startswith("FINE:"):
            raw = stripped.split(":", 1)[1].strip().replace("$", "").replace(",", "")
            try:
                fine = Decimal(raw)
            except Exception:
                fine = SEVERITY_FINE_MAP[severity]
        elif stripped.upper().startswith("ANALYSIS:"):
            analysis_lines.append(stripped.split(":", 1)[1].strip())
        elif stripped.upper() == "ACTIONS:":
            in_actions = True
        elif in_actions and stripped.startswith("-"):
            action = stripped.lstrip("- ").strip()
            if action:
                actions.append(action)
        elif not in_actions and analysis_lines is not None and stripped:
            # continuation of analysis
            if analysis_lines:
                analysis_lines.append(stripped)

    analysis = " ".join(analysis_lines).strip() or "No analysis provided."
    if not actions:
        actions = ["Review the violation with the property owner", "Issue formal written notice", "Schedule follow-up inspection"]

    return analysis, severity, fine, actions


def _build_prompt(req: AIAnalysisRequest) -> str:
    parts = [
        f"Violation Type: {req.violation_type}",
        f"Description: {req.violation_description}",
    ]
    if req.property_address:
        parts.append(f"Property Address: {req.property_address}")
    return "\n".join(parts)


@router.post("/analyze", response_model=AIAnalysisResponse)
def analyze_violation(
    req: AIAnalysisRequest,
    current_user: User = Depends(require_board_or_admin),
):
    settings = get_settings()
    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=SYSTEM_PROMPT,
        )
        response = model.generate_content(_build_prompt(req))
        text = response.text
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service error: {str(exc)}",
        )

    analysis, severity, fine, actions = _parse_ai_response(text)
    return AIAnalysisResponse(
        analysis=analysis,
        suggested_severity=severity,
        suggested_fine=fine,
        recommended_actions=actions,
    )


@router.post("/violations/{violation_id}/analyze", response_model=ViolationResponse)
def analyze_and_update_violation(
    violation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_board_or_admin),
):
    violation = (
        db.query(Violation)
        .options(
            joinedload(Violation.property).joinedload(Property.owner),
            joinedload(Violation.reported_by_user),
            joinedload(Violation.assigned_to_user),
        )
        .filter(Violation.id == violation_id)
        .first()
    )
    if not violation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Violation not found")

    req = AIAnalysisRequest(
        violation_description=violation.description,
        violation_type=violation.violation_type,
        property_address=violation.property.address if violation.property else None,
    )

    settings = get_settings()
    try:
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(
            model_name="gemini-1.5-flash",
            system_instruction=SYSTEM_PROMPT,
        )
        response = model.generate_content(_build_prompt(req))
        text = response.text
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"AI service error: {str(exc)}",
        )

    analysis, severity, fine, _ = _parse_ai_response(text)
    violation.ai_analysis = analysis
    violation.ai_suggested_severity = severity.value
    violation.ai_suggested_fine = fine
    db.commit()
    db.refresh(violation)
    return violation
