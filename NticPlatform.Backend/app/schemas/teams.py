from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field

class TeamCreate(BaseModel):
    name: str
    track: str = ""
    lead: str = ""
    members: int = 1
    status: str = "Active"
    school_name: str = ""
    mentor: str = ""
    motto: str = ""
    roster_list: list = []
    # Which cycle this team is competing in. Optional: teams created before
    # cycles were linked, and teams not tied to one, carry None.
    competition_id: Optional[str] = None
    # Member identities. Used to build real team_members rows keyed by
    # account. lead_email/member_emails are optional and may be empty when a
    # form only collected names; those rows are stored name-only until a
    # student account is linked.
    lead_email: str = Field(default="", max_length=150)
    member_emails: list[str] = Field(default_factory=list)

class AssignMentorPayload(BaseModel):
    mentor_id: Optional[str] = None

class MentorRequestPayload(BaseModel):
    mode: str = "auto_track"  # "auto_track" | "existing" | "suggested"
    mentor_id: Optional[str] = None
    suggested_name: Optional[str] = None
    suggested_email: Optional[str] = None
    suggested_phone: Optional[str] = None
    suggested_org: Optional[str] = None
    suggested_expertise: Optional[str] = None
    suggested_bio: Optional[str] = None
