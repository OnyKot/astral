-- Discovery join requests for private discoverable guilds.
-- Public discoverable guilds can be joined directly; guilds with
-- INVITES_DISABLED keep invite privacy and collect requests here.

CREATE TABLE IF NOT EXISTS astral.guild_join_requests (
    guild_id bigint,
    user_id bigint,
    status text,                  -- pending | approved | rejected | withdrawn
    requested_at timestamp,
    message text,                 -- optional user-provided note
    reviewed_by bigint,           -- manager/admin id; null until reviewed
    reviewed_at timestamp,
    review_note text,
    PRIMARY KEY ((guild_id), user_id)
);

CREATE INDEX IF NOT EXISTS guild_join_requests_status_idx
    ON astral.guild_join_requests (status);

CREATE INDEX IF NOT EXISTS guild_join_requests_requested_at_idx
    ON astral.guild_join_requests (requested_at);
