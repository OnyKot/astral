CREATE TABLE IF NOT EXISTS astral.user_dm_history (
    user_id bigint,
    channel_id bigint,
    PRIMARY KEY ((user_id), channel_id)
);
