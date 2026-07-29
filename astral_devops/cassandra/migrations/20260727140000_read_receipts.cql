-- Read receipts ("✓✓ seen") for private channels.
--
-- `read_states` is partitioned by (user_id) and answers "what have I read".
-- Telling a sender that the recipient has seen a message needs the opposite
-- lookup — "who has read this channel, and up to where" — which that table
-- cannot serve without a full scan. This one is partitioned by channel_id so
-- the receipts for a DM are a single-partition read.
--
-- Scope is private channels only (DM / GROUP_DM); guild channels are never
-- written here, both for privacy and because a busy channel would turn every
-- open into a fan-out storm.
CREATE TABLE IF NOT EXISTS astral.channel_read_receipts (
    channel_id bigint,
    user_id bigint,
    message_id bigint,
    read_at timestamp,
    PRIMARY KEY ((channel_id), user_id)
);

-- Opt-out, mirroring Telegram: turning receipts off stops publishing yours and
-- also hides everyone else's from you. Nullable so existing rows default to
-- enabled without a backfill.
ALTER TABLE astral.user_settings ADD read_receipts_enabled boolean;
