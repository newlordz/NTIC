from typing import Optional, List
import uuid

try:
    from pydantic import BaseModel, Field
except ImportError:
    BaseModel = object

class StudentCreateRequest:
    def __init__(self, first_name: str, last_name: str, email: str, track: str = "Coding", consent_granted: bool = True, tenant_id: str = "11111111-1111-1111-1111-111111111111"):
        self.first_name = first_name
        self.last_name = last_name
        self.email = email
        self.track = track
        self.consent_granted = consent_granted
        self.tenant_id = tenant_id

class SubmissionCreateRequest:
    def __init__(self, student_id: str, source_code_path: str, video_url: str = "", tenant_id: str = "11111111-1111-1111-1111-111111111111"):
        self.student_id = student_id
        self.source_code_path = source_code_path
        self.video_url = video_url
        self.tenant_id = tenant_id
