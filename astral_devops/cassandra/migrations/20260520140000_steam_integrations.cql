-- Steam OpenID 2.0 integration: connection-only (no rich presence yet).
-- A user connects their Steam account via Steam OpenID, we resolve the SteamID64,
-- fetch the public profile via Steam Web API (server-side STEAM_API_KEY), and store
-- a single row keyed by user_id.

CREATE TABLE IF NOT EXISTS astral.steam_connections (
    user_id bigint PRIMARY KEY,
    steam_id text,
    persona_name text,
    profile_url text,
    avatar_url text,
    visibility int,
    real_name text,
    primary_clan_id text,
    country_code text,
    last_logoff_at timestamp,
    connected_at timestamp,
    updated_at timestamp
);

-- Reverse lookup: who owns a given Steam account.
-- Used to enforce 1-to-1 mapping (each Steam id can be linked to at most one Astral user).
CREATE TABLE IF NOT EXISTS astral.steam_connections_by_steam_id (
    steam_id text PRIMARY KEY,
    user_id bigint
);
