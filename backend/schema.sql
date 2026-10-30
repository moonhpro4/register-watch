CREATE TABLE IF NOT EXISTS cameras(id TEXT PRIMARY KEY, store TEXT, name TEXT, token TEXT, zone TEXT, verified_at INTEGER, last_ai INTEGER DEFAULT 0, last_frame INTEGER DEFAULT 0, shift_id TEXT);
CREATE TABLE IF NOT EXISTS alerts(id TEXT PRIMARY KEY, camera_id TEXT, kind TEXT, note TEXT, image_key TEXT, created_at INTEGER);
CREATE TABLE IF NOT EXISTS shifts(id TEXT PRIMARY KEY, camera_id TEXT, started_at INTEGER, ended_at INTEGER, closed_at INTEGER DEFAULT 0, frames INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS latest(camera_id TEXT PRIMARY KEY, data TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS frames(shift_id TEXT, camera_id TEXT, ts INTEGER, data TEXT, PRIMARY KEY(shift_id, ts));
CREATE TABLE IF NOT EXISTS alert_images(alert_id TEXT PRIMARY KEY, data TEXT);
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
