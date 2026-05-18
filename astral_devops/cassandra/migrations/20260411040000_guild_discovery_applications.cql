-- Discovery moderation queue.
-- A guild owner submits an application to be listed in /discover; admins
-- approve or reject it. Approved guilds get the DISCOVERY_APPROVED feature
-- flag and become visible to the discovery search.

CREATE TABLE IF NOT EXISTS astral.guild_discovery_applications (
    guild_id bigint,
    status text,                  -- pending | approved | rejected | withdrawn
    submitted_by bigint,          -- user id of the guild member who applied
    submitted_at timestamp,
    reviewed_by bigint,           -- admin id; null until reviewed
    reviewed_at timestamp,        -- timestamp of approve/reject
    review_note text,             -- moderator's reason for the decision
    category text,                -- one of GUILD_DISCOVERY_CATEGORY_IDS
    description text,             -- long-form pitch shown in the queue
    tags set<text>,
    PRIMARY KEY ((guild_id))
);

-- Index by status so the admin queue can list pending applications without
-- scanning the whole table.
CREATE INDEX IF NOT EXISTS guild_discovery_apps_status_idx
    ON astral.guild_discovery_applications (status);

-- Index on submitted_at so the queue can sort oldest-first.
CREATE INDEX IF NOT EXISTS guild_discovery_apps_submitted_at_idx
    ON astral.guild_discovery_applications (submitted_at);
