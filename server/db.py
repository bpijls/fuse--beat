import aiosqlite

DB_PATH = "fusebeat.db"

CREATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS devices (
    device_id TEXT PRIMARY KEY,
    color     TEXT NOT NULL DEFAULT '#FF0000',
    feed_id   TEXT,
    name      TEXT,
    version   TEXT
);

CREATE TABLE IF NOT EXISTS groups (
    group_id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS device_groups (
    device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
    group_id  TEXT NOT NULL REFERENCES groups(group_id)  ON DELETE CASCADE,
    PRIMARY KEY (device_id, group_id)
);
"""


async def init_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.executescript(CREATE_SCHEMA)
    # Add name column if it doesn't exist yet (migration for existing DBs)
    for col in ("name TEXT", "version TEXT"):
        try:
            await db.execute(f"ALTER TABLE devices ADD COLUMN {col}")
            await db.commit()
        except Exception:
            pass  # column already exists
    return db


# ── Devices ───────────────────────────────────────────────────────────────────

async def upsert_device(db, device_id: str, color: str, feed_id: str | None, version: str | None = None):
    await db.execute(
        """INSERT INTO devices (device_id, color, feed_id, name, version)
           VALUES (?, ?, ?, NULL, ?)
           ON CONFLICT(device_id) DO UPDATE SET
               color=excluded.color,
               feed_id=excluded.feed_id,
               version=excluded.version""",
        (device_id, color, feed_id, version),
    )
    await db.commit()


async def set_device_name(db, device_id: str, name: str):
    await db.execute(
        """INSERT INTO devices (device_id, color, feed_id, name)
           VALUES (?, '#FF0000', NULL, ?)
           ON CONFLICT(device_id) DO UPDATE SET name=excluded.name""",
        (device_id, name),
    )
    await db.commit()


async def get_device(db, device_id: str) -> dict | None:
    async with db.execute("SELECT * FROM devices WHERE device_id = ?", (device_id,)) as cur:
        row = await cur.fetchone()
        return dict(row) if row else None


async def get_all_devices(db) -> list[dict]:
    async with db.execute("SELECT * FROM devices") as cur:
        return [dict(r) for r in await cur.fetchall()]


async def delete_device(db, device_id: str) -> bool:
    cur = await db.execute("DELETE FROM devices WHERE device_id = ?", (device_id,))
    await db.commit()
    return cur.rowcount > 0


async def update_device_color(db, device_id: str, color: str) -> bool:
    cur = await db.execute(
        "UPDATE devices SET color = ? WHERE device_id = ?", (color, device_id)
    )
    await db.commit()
    return cur.rowcount > 0


# ── Groups ────────────────────────────────────────────────────────────────────

async def create_group(db, group_id: str):
    await db.execute(
        "INSERT OR IGNORE INTO groups (group_id) VALUES (?)", (group_id,)
    )
    await db.commit()


async def get_all_groups(db) -> list[str]:
    async with db.execute("SELECT group_id FROM groups") as cur:
        return [r["group_id"] for r in await cur.fetchall()]


# ── Device–Group membership ───────────────────────────────────────────────────

async def add_device_to_group(db, device_id: str, group_id: str):
    await db.execute(
        "INSERT OR IGNORE INTO device_groups (device_id, group_id) VALUES (?, ?)",
        (device_id, group_id),
    )
    await db.commit()


async def remove_device_from_group(db, device_id: str, group_id: str) -> bool:
    cur = await db.execute(
        "DELETE FROM device_groups WHERE device_id = ? AND group_id = ?",
        (device_id, group_id),
    )
    await db.commit()
    return cur.rowcount > 0


async def get_group_devices(db, group_id: str) -> list[dict]:
    async with db.execute(
        """SELECT d.device_id, d.color
           FROM devices d
           JOIN device_groups dg ON d.device_id = dg.device_id
           WHERE dg.group_id = ?""",
        (group_id,),
    ) as cur:
        return [dict(r) for r in await cur.fetchall()]


async def get_group_device_ids(db, group_id: str) -> list[str]:
    async with db.execute(
        "SELECT device_id FROM device_groups WHERE group_id = ?", (group_id,)
    ) as cur:
        return [r["device_id"] for r in await cur.fetchall()]


async def get_device_groups(db, device_id: str) -> list[str]:
    async with db.execute(
        "SELECT group_id FROM device_groups WHERE device_id = ?", (device_id,)
    ) as cur:
        return [r["group_id"] for r in await cur.fetchall()]
