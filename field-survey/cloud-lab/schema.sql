CREATE TABLE submissions (
 room TEXT NOT NULL, id TEXT NOT NULL, contributor TEXT NOT NULL,
 location TEXT NOT NULL, condition TEXT NOT NULL, quality TEXT NOT NULL,
 digest TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(room,id), UNIQUE(room,digest)
);
CREATE INDEX submissions_age ON submissions(created_at);
