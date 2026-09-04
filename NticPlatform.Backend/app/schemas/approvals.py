from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

class ApprovalCreate(BaseModel):
    # `status` is intentionally ignored on create: an approval is always
    # created 'pending' and only the Reviewer/Access decision endpoint
    # (PATCH /api/approvals/{id}) may move it to approved/rejected. Allowing
    # a client to stash a status here was another blind writer that could put
    # a row straight into 'approved' with no provisioning.
    id: str
    type: str
    entity: str
    contact: str = ""
    submitted: str = ""
    details: dict = {}
    status: str = "pending"

class ApprovalUpdate(BaseModel):
    status: str = ""
    reviewed_at: str = ""
    reviewer: str = ""
    rejection_reasons: str = ""
    rejection_notes: str = ""

class InstitutionApprovalDecision(BaseModel):
    action: str  # 'approve', 'reject'
    notes: Optional[str] = ""
    reasons: Optional[str] = ""
