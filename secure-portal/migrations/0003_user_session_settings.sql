CREATE TABLE IF NOT EXISTS user_session_settings (
 user_id TEXT PRIMARY KEY REFERENCES users(id),
 idle_minutes INTEGER NOT NULL DEFAULT 30 CHECK(idle_minutes BETWEEN 1 AND 480)
);
