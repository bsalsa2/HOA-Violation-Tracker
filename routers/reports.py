import io
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
)
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from auth import get_current_user, require_board_or_admin
from database import get_db
from models import User, Violation, Property, ViolationStatus, ViolationSeverity, UserRole
from schemas import DashboardStats

router = APIRouter(prefix="/reports", tags=["Reports"])

# ── Dashboard stats ───────────────────────────────────────────────────────────

@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Violation)
    if current_user.role == UserRole.resident:
        owned_ids = db.query(Property.id).filter(Property.owner_id == current_user.id).subquery()
        query = query.filter(
            (Violation.property_id.in_(owned_ids)) |
            (Violation.reported_by == current_user.id)
        )

    violations = query.all()

    total = len(violations)
    status_counts = {s.value: 0 for s in ViolationStatus}
    type_counts: dict = {}
    severity_counts: dict = {s.value: 0 for s in ViolationSeverity}
    total_fines = Decimal("0")
    collected_fines = Decimal("0")

    for v in violations:
        status_counts[v.status.value] += 1
        type_counts[v.violation_type] = type_counts.get(v.violation_type, 0) + 1
        severity_counts[v.severity.value] += 1
        total_fines += v.fine_amount or Decimal("0")
        if v.fine_paid:
            collected_fines += v.fine_amount or Decimal("0")

    return DashboardStats(
        total_violations=total,
        open_violations=status_counts["open"],
        resolved_violations=status_counts["resolved"],
        dismissed_violations=status_counts["dismissed"],
        under_review_violations=status_counts["under_review"],
        total_fines_issued=total_fines,
        total_fines_collected=collected_fines,
        violations_by_type=type_counts,
        violations_by_severity=severity_counts,
    )


# ── PDF report ────────────────────────────────────────────────────────────────

def _severity_color(severity: str) -> colors.Color:
    return {
        "low": colors.HexColor("#28a745"),
        "medium": colors.HexColor("#ffc107"),
        "high": colors.HexColor("#fd7e14"),
        "critical": colors.HexColor("#dc3545"),
    }.get(severity, colors.grey)


def _status_color(s: str) -> colors.Color:
    return {
        "open": colors.HexColor("#dc3545"),
        "under_review": colors.HexColor("#ffc107"),
        "resolved": colors.HexColor("#28a745"),
        "dismissed": colors.HexColor("#6c757d"),
    }.get(s, colors.grey)


def _build_pdf(violations: list[Violation], title: str, generated_by: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=1 * inch,
        bottomMargin=1 * inch,
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ReportTitle",
        parent=styles["Title"],
        fontSize=20,
        textColor=colors.HexColor("#1a1a2e"),
        spaceAfter=6,
    )
    subtitle_style = ParagraphStyle(
        "Subtitle",
        parent=styles["Normal"],
        fontSize=10,
        textColor=colors.grey,
        spaceAfter=12,
    )
    section_style = ParagraphStyle(
        "Section",
        parent=styles["Heading2"],
        fontSize=13,
        textColor=colors.HexColor("#1a1a2e"),
        spaceBefore=14,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontSize=9,
        leading=13,
    )

    now = datetime.now(timezone.utc).strftime("%B %d, %Y at %H:%M UTC")
    story = [
        Paragraph(title, title_style),
        Paragraph(f"Generated on {now} by {generated_by}", subtitle_style),
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#dee2e6")),
        Spacer(1, 12),
    ]

    # Summary table
    open_count = sum(1 for v in violations if v.status == ViolationStatus.open)
    resolved_count = sum(1 for v in violations if v.status == ViolationStatus.resolved)
    total_fines = sum((v.fine_amount or Decimal("0")) for v in violations)
    collected = sum((v.fine_amount or Decimal("0")) for v in violations if v.fine_paid)

    summary_data = [
        ["Total Violations", "Open", "Resolved", "Total Fines", "Collected"],
        [
            str(len(violations)),
            str(open_count),
            str(resolved_count),
            f"${total_fines:,.2f}",
            f"${collected:,.2f}",
        ],
    ]
    summary_table = Table(summary_data, colWidths=[1.4 * inch] * 5)
    summary_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8f9fa"), colors.white]),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dee2e6")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(Paragraph("Summary", section_style))
    story.append(summary_table)
    story.append(Spacer(1, 16))

    # Violations table
    if violations:
        story.append(Paragraph(f"Violations ({len(violations)} records)", section_style))
        headers = ["ID", "Title", "Type", "Property", "Severity", "Status", "Fine", "Date"]
        col_widths = [0.4*inch, 1.6*inch, 1.0*inch, 1.4*inch, 0.7*inch, 0.8*inch, 0.6*inch, 0.8*inch]

        table_data = [headers]
        for v in violations:
            address = v.property.address if v.property else "N/A"
            if len(address) > 22:
                address = address[:20] + "…"
            title_text = v.title if len(v.title) <= 25 else v.title[:23] + "…"
            table_data.append([
                str(v.id),
                title_text,
                v.violation_type,
                address,
                v.severity.value.capitalize(),
                v.status.value.replace("_", " ").capitalize(),
                f"${v.fine_amount or 0:,.0f}",
                v.created_at.strftime("%m/%d/%y") if v.created_at else "",
            ])

        violations_table = Table(table_data, colWidths=col_widths, repeatRows=1)
        violations_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a1a2e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("ALIGN", (0, 0), (0, -1), "CENTER"),
            ("ALIGN", (6, 0), (6, -1), "RIGHT"),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.HexColor("#f8f9fa"), colors.white]),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dee2e6")),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("WORDWRAP", (1, 1), (1, -1), True),
        ]))
        story.append(violations_table)

    # Detailed breakdown for each violation
    story.append(Spacer(1, 20))
    story.append(Paragraph("Detailed Records", section_style))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#dee2e6")))

    for v in violations:
        story.append(Spacer(1, 10))
        story.append(Paragraph(f"#{v.id} — {v.title}", styles["Heading3"]))
        detail_data = [
            ["Type:", v.violation_type, "Status:", v.status.value.replace("_", " ").capitalize()],
            ["Severity:", v.severity.value.capitalize(), "Fine:", f"${v.fine_amount or 0:,.2f}"],
            ["Property:", v.property.address if v.property else "N/A", "Fine Paid:", "Yes" if v.fine_paid else "No"],
            ["Reported By:", v.reported_by_user.full_name if v.reported_by_user else "N/A",
             "Reported On:", v.created_at.strftime("%B %d, %Y") if v.created_at else "N/A"],
        ]
        dt = Table(detail_data, colWidths=[1.0*inch, 2.5*inch, 1.0*inch, 2.3*inch])
        dt.setStyle(TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        story.append(dt)
        story.append(Paragraph(f"<b>Description:</b> {v.description}", body_style))
        if v.ai_analysis:
            story.append(Paragraph(f"<b>AI Analysis:</b> {v.ai_analysis}", body_style))
        story.append(HRFlowable(width="100%", thickness=0.3, color=colors.HexColor("#dee2e6")))

    doc.build(story)
    buffer.seek(0)
    return buffer.read()


@router.get("/pdf")
def generate_pdf_report(
    status_filter: Optional[str] = Query(None, alias="status"),
    property_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_board_or_admin),
):
    query = db.query(Violation).options(
        joinedload(Violation.property).joinedload(Property.owner),
        joinedload(Violation.reported_by_user),
    )
    if status_filter:
        try:
            status_enum = ViolationStatus(status_filter)
            query = query.filter(Violation.status == status_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid status filter: {status_filter}",
            )
    if property_id:
        query = query.filter(Violation.property_id == property_id)

    violations = query.order_by(Violation.created_at.desc()).all()

    report_title = "HOA Violation Report"
    if status_filter:
        report_title = f"HOA Violation Report — {status_filter.replace('_', ' ').title()}"

    pdf_bytes = _build_pdf(violations, report_title, current_user.full_name)

    filename = f"hoa_violations_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/pdf/violation/{violation_id}")
def generate_single_violation_pdf(
    violation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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

    if current_user.role == UserRole.resident:
        if violation.property.owner_id != current_user.id and violation.reported_by != current_user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    pdf_bytes = _build_pdf([violation], f"Violation #{violation_id} Report", current_user.full_name)
    filename = f"violation_{violation_id}_{datetime.now(timezone.utc).strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
