
import os, uuid
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse
from .auth import get_current_user

STORAGE_DIR = os.getenv("STORAGE_DIR", "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

router = APIRouter()

@router.post("")
async def upload(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    if not file.filename:
        raise HTTPException(400, "File missing")
    ext = os.path.splitext(file.filename)[1]
    aid = str(uuid.uuid4()) + ext
    dest = os.path.join(STORAGE_DIR, aid)
    with open(dest, "wb") as f:
        f.write(await file.read())
    return {"attachment_id": aid, "url": f"/api/v1/attachments/{aid}"}

@router.get("/{attachment_id}")
async def get(attachment_id: str, current_user: dict = Depends(get_current_user)):
    path = os.path.join(STORAGE_DIR, attachment_id)
    real_path = os.path.realpath(path)
    if not real_path.startswith(os.path.realpath(STORAGE_DIR)):
        raise HTTPException(403, "Access denied")
    if not os.path.exists(real_path):
        raise HTTPException(404, "Not found")
    return FileResponse(real_path)
