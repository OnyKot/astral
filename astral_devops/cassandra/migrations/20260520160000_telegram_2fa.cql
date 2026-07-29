-- Telegram-based 2FA: when telegram_2fa_enabled=true, the next time the
-- user logs in from a session we will require them to type the 6-digit
-- code we send to their Telegram chat (via TelegramNotificationsService.
-- sendSecurityCode). The code itself lives in Redis with a 5-minute TTL,
-- this column only stores whether the feature is on.

ALTER TABLE astral.telegram_connections ADD telegram_2fa_enabled boolean;
