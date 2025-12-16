
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class LoginRequest(BaseModel):
    username: str
    role: str  # Operator|Supervisor|Owner|Auditor

@router.post("/login")
def login(req: LoginRequest):
    return {"access_token": "dev-token", "token_type": "bearer", "role": req.role}
