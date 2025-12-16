
import os, uuid
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import FileResponse

STORAGE_DIR = os.getenv("STORAGE_DIR", "storage")
os.makedirs(STORAGE_DIR, exist_ok=True)

router = APIRouter()

@router.post("")
async def upload(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(400, "File missing")
    ext = os.path.splitext(file.filename)[1]
    aid = str(uuid.uuid4()) + ext
    dest = os.path.join(STORAGE_DIR, aid)
    with open(dest, "wb") as f:
        f.write(await file.read())
    return {"attachment_id": aid, "url": f"/api/v1/attachments/{aid}"}

@router.get("/{attachment_id}")
async def get(attachment_id: str):
    path = os.path.join(STORAGE_DIR, attachment_id)
    if not os.path.exists(path):
        raise HTTPException(404, "Not found")
    return FileResponse(path)
