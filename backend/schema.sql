CREATE TABLE IF NOT EXISTS cameras(id TEXT PRIMARY KEY, store TEXT, name TEXT, token TEXT, zone TEXT, verified_at INTEGER, last_ai INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY, camera_id TEXT, kind TEXT, note TEXT, image_key TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS devices(token TEXT PRIMARY KEY);
