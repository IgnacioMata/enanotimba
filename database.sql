CREATE TABLE IF NOT EXISTS kick_chat (
  message_id text PRIMARY KEY,
  user_id text NOT NULL,
  username text NOT NULL,
  sent_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS kick_chat_sent_at ON kick_chat(sent_at);

CREATE TABLE IF NOT EXISTS community_blacklist (
  username text PRIMARY KEY CHECK (username = lower(username)),
  reason text NOT NULL
);

CREATE TABLE IF NOT EXISTS community_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  label text NOT NULL,
  claimed_at timestamptz
);
CREATE INDEX IF NOT EXISTS community_prizes_user ON community_prizes(user_id);
