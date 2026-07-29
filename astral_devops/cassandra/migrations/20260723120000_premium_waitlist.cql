CREATE TABLE IF NOT EXISTS astral.premium_waitlist (
    user_id bigint PRIMARY KEY,
    plan text,
    comment text,
    created_at timestamp,
    updated_at timestamp
);
