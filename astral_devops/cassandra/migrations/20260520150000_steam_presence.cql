-- Steam current-game presence: store what the user is currently playing
-- so we can show 'Иван играет в Counter-Strike 2' on their Astral profile.
-- Updated by a periodic worker that calls Steam GetPlayerSummaries every
-- ~60 seconds for users who have Steam linked.
--
-- All fields are optional / nullable: a private profile, an offline user,
-- or 'not playing anything right now' all map to null game fields.

ALTER TABLE astral.steam_connections ADD current_game_id text;
ALTER TABLE astral.steam_connections ADD current_game_name text;
ALTER TABLE astral.steam_connections ADD current_game_started_at timestamp;
ALTER TABLE astral.steam_connections ADD persona_state int;
ALTER TABLE astral.steam_connections ADD presence_synced_at timestamp;
ALTER TABLE astral.steam_connections ADD presence_visible boolean;
