-- Discord-style Interactions API support.
--
-- Adds two columns:
--
--   1. astral.messages.components — JSON-serialised list of action rows
--      (buttons / select menus / future component types). We deliberately
--      keep this as `text` rather than a UDT because:
--        - the component schema evolves often (Discord ships new component
--          types and we want to store them forwards-compatibly without
--          shipping a migration every time)
--        - we never query by any component field, so we lose nothing by
--          storing the blob opaquely
--        - the embeds/attachments columns are UDTs and have caused pain
--          on schema bumps; we don't want to repeat that
--
--   2. astral.webhooks.interaction_url — outbound HTTP endpoint that
--      Astral POSTs to when a user clicks a button on a message authored
--      by this webhook. Optional. Without it, components on the webhook's
--      messages render but clicks become no-ops.
--
-- Both columns are nullable so existing rows remain valid; the application
-- code treats null/missing as "no components" / "no interaction handler".
-- Adding columns to a Cassandra table is a fast metadata-only operation,
-- safe to run online.

ALTER TABLE astral.messages ADD components text;

ALTER TABLE astral.webhooks ADD interaction_url text;
