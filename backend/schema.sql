CREATE TABLE IF NOT EXISTS cameras(id TEXT PRIMARY KEY, store TEXT, name TEXT, token TEXT, zone TEXT, verified_at INTEGER, last_ai INTEGER DEFAULT 0, last_frame INTEGER DEFAULT 0, shift_id TEXT);
CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY, camera_id TEXT, kind TEXT, note TEXT, image_key TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS shifts(id TEXT PRIMARY KEY, camera_id TEXT, started_at INTEGER, ended_at INTEGER, closed_at INTEGER DEFAULT 0, frames INTEGER DEFAULT 0);
