from __future__ import annotations
from pydantic import BaseModel, Field

class ChatRequest(BaseModel):
    system_instruction: dict = {}
    contents: list = []
    generationConfig: dict = {}

class TicketCreate(BaseModel):
    userId: str = Field(default="", max_length=120)
    userName: str = Field(default="", max_length=120)
    userRole: str = Field(default="", max_length=40)
    userEmail: str = Field(default="", max_length=254)
    chatHistory: list = []

class TicketReply(BaseModel):
    agentName: str
    text: str

class TicketStatusUpdate(BaseModel):
    status: str
