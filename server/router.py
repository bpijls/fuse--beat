from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
import db as database

router = APIRouter()


def get_db(request: Request):
    return request.app.state.db


# ── Devices ───────────────────────────────────────────────────────────────────

@router.get("/devices")
async def list_devices(conn=Depends(get_db)):
    return await database.get_all_devices(conn)


class ColorUpdate(BaseModel):
    color: str


@router.put("/devices/{device_id}/color")
async def update_color(device_id: str, body: ColorUpdate, conn=Depends(get_db)):
    updated = await database.update_device_color(conn, device_id, body.color)
    if not updated:
        raise HTTPException(404, "Device not found")
    return {"ok": True}


@router.get("/devices/{device_id}/groups")
async def device_groups(device_id: str, conn=Depends(get_db)):
    return await database.get_device_groups(conn, device_id)


# ── Groups ────────────────────────────────────────────────────────────────────

@router.get("/groups")
async def list_groups(conn=Depends(get_db)):
    return await database.get_all_groups(conn)


@router.post("/groups/{group_id}", status_code=201)
async def create_group(group_id: str, conn=Depends(get_db)):
    await database.create_group(conn, group_id)
    return {"group_id": group_id}


@router.get("/groups/{group_id}/devices")
async def group_devices(group_id: str, conn=Depends(get_db)):
    return await database.get_group_devices(conn, group_id)


@router.post("/groups/{group_id}/devices/{device_id}", status_code=201)
async def add_to_group(group_id: str, device_id: str, conn=Depends(get_db)):
    if not await database.get_device(conn, device_id):
        raise HTTPException(404, "Device not found")
    await database.create_group(conn, group_id)
    await database.add_device_to_group(conn, device_id, group_id)
    return {"ok": True}


@router.delete("/groups/{group_id}/devices/{device_id}")
async def remove_from_group(group_id: str, device_id: str, conn=Depends(get_db)):
    removed = await database.remove_device_from_group(conn, device_id, group_id)
    if not removed:
        raise HTTPException(404, "Membership not found")
    return {"ok": True}
