-- Telegram Login Widget + connection-only integration.
-- Phase 1: a user connects their Telegram account via Telegram Login Widget,
-- HMAC-SHA256 over bot_token verifies the assertion, and we store a single
-- connection row keyed by user_id. This row will later be used by the
-- AstralNotifyBot (Phase 3) to deliver push notifications.

CREATE TABLE IF NOT EXISTS astral.telegram_connections (
    user_id bigint PRIMARY KEY,
    telegram_user_id bigint,
    username text,
    first_name text,
    last_name text,
    photo_url text,
    language_code text,
    is_premium boolean,
    auth_date timestamp,
    notifications_enabled boolean,
    notification_preferences_json text,
    connected_at timestamp,
    updated_at timestamp
);

-- Reverse lookup: who owns a given Telegram account.
CREATE TABLE IF NOT EXISTS astral.telegram_connections_by_telegram_user_id (
    telegram_user_id bigint PRIMARY KEY,
    user_id bigint
);
