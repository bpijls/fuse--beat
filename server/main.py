import asyncio
import json
import os
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

load_dotenv()

import db as database
from router import router

WS_SERVER      = os.environ.get("WS_SERVER",      "ws://localhost:5001/ws")
WHITELIST_URL  = os.environ.get("WHITELIST_URL",  "https://whitelist.feib.nl")


async def is_mac_whitelisted(mac: str) -> bool:
    url = f"{WHITELIST_URL.rstrip('/')}/api/v1/check/{mac}"
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(url)
            return resp.status_code == 200 and resp.json().get("whitelisted", False)
    except Exception:
        return False


# ── Connection manager ────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.device_connections: dict[str, WebSocket] = {}
        self.client_subscriptions: dict[WebSocket, set[str]] = {}

    async def _send(self, ws: WebSocket, payload: dict):
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            pass

    async def connect_device(self, device_id: str, ws: WebSocket):
        self.device_connections[device_id] = ws

    def disconnect_device(self, device_id: str):
        self.device_connections.pop(device_id, None)

    def connect_client(self, ws: WebSocket):
        self.client_subscriptions[ws] = set()

    def disconnect_client(self, ws: WebSocket):
        self.client_subscriptions.pop(ws, None)

    def subscribe(self, ws: WebSocket, group_id: str):
        if ws in self.client_subscriptions:
            self.client_subscriptions[ws].add(group_id)

    def unsubscribe(self, ws: WebSocket, group_id: str):
        if ws in self.client_subscriptions:
            self.client_subscriptions[ws].discard(group_id)

    async def on_heartbeat(self, db, device_id: str, timestamp_ms: int):
        device = await database.get_device(db, device_id)
        if not device:
            return
        groups = await database.get_device_groups(db, device_id)

        for group_id in groups:
            fused = {
                "type": "fused_beat",
                "device_id": device_id,
                "color": device["color"],
                "group_id": group_id,
            }
            event = {
                "type": "heartbeat_event",
                "device_id": device_id,
                "color": device["color"],
                "group_id": group_id,
                "timestamp_ms": timestamp_ms,
            }

            # Fan fused_beat to all connected devices in this group
            for did in await database.get_group_device_ids(db, group_id):
                if did in self.device_connections:
                    await self._send(self.device_connections[did], fused)

            # Fan heartbeat_event to all subscribed clients
            for ws, subs in list(self.client_subscriptions.items()):
                if group_id in subs:
                    await self._send(ws, event)


manager = ConnectionManager()


# ── App lifecycle ─────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await database.init_db()
    yield
    await app.state.db.close()


app = FastAPI(lifespan=lifespan)
app.include_router(router)


@app.get("/config")
def get_config():
    return {"ws_server": WS_SERVER}


# ── WebSocket endpoint ────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    db = app.state.db
    device_id: str | None = None
    is_device = False

    try:
        async for raw in ws.iter_text():
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")

            if msg_type == "identify":
                if msg.get("client_type") == "device":
                    mac = msg.get("mac", "")
                    if not await is_mac_whitelisted(mac):
                        print(f"[auth] rejected device mac={mac!r} — not whitelisted", flush=True)
                        await ws.send_text(json.dumps({"type": "error", "reason": "not_whitelisted"}))
                        await ws.close(code=4403)
                        return
                    is_device = True
                    device_id = msg.get("device_id", "unknown")
                    await database.upsert_device(
                        db,
                        device_id,
                        msg.get("color", "#FFFFFF"),
                        msg.get("feed_id"),
                    )
                    await manager.connect_device(device_id, ws)
                    manager.connect_client(ws)
                    await ws.send_text(json.dumps({"type": "identified"}))
                else:
                    manager.connect_client(ws)

            elif msg_type == "heartbeat" and is_device:
                print(f"[heartbeat] device={device_id} t={msg.get('timestamp_ms', 0)}", flush=True)
                await manager.on_heartbeat(db, device_id, msg.get("timestamp_ms", 0))

            elif msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))

            elif msg_type == "subscribe":
                manager.subscribe(ws, msg["group_id"])

            elif msg_type == "unsubscribe":
                manager.unsubscribe(ws, msg["group_id"])

            elif msg_type == "get_group_devices":
                devices = await database.get_group_devices(db, msg["group_id"])
                await ws.send_text(json.dumps({
                    "type": "group_devices",
                    "group_id": msg["group_id"],
                    "devices": devices,
                }))

            elif msg_type == "get_device_groups":
                groups = await database.get_device_groups(db, msg["device_id"])
                await ws.send_text(json.dumps({
                    "type": "device_groups",
                    "device_id": msg["device_id"],
                    "groups": groups,
                }))

    except WebSocketDisconnect:
        pass
    finally:
        if is_device and device_id:
            manager.disconnect_device(device_id)
        manager.disconnect_client(ws)


# ── Static files ──────────────────────────────────────────────────────────────

_firmware_dir = os.path.join(os.path.dirname(__file__), "static", "firmware")
if os.path.isdir(_firmware_dir):
    app.mount("/firmware", StaticFiles(directory=_firmware_dir), name="firmware")

_static_dir = os.environ.get("STATIC_DIR", "")
if _static_dir and os.path.isdir(_static_dir):
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
