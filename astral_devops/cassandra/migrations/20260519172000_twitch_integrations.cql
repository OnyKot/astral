CREATE TABLE IF NOT EXISTS astral.twitch_connections (
    user_id bigint PRIMARY KEY,
    twitch_user_id text,
    login text,
    display_name text,
    profile_image_url text,
    access_token text,
    refresh_token text,
    scopes set<text>,
    settings_json text,
    token_expires_at timestamp,
    connected_at timestamp,
    updated_at timestamp
);

CREATE TABLE IF NOT EXISTS astral.twitch_connections_by_twitch_user_id (
    twitch_user_id text PRIMARY KEY,
    user_id bigint
);

CREATE TABLE IF NOT EXISTS astral.twitch_creator_programs (
    user_id bigint PRIMARY KEY,
    twitch_user_id text,
    broadcaster_login text,
    broadcaster_display_name text,
    enabled boolean,
    subscriber_perks_enabled boolean,
    channel_points_enabled boolean,
    eventsub_status text,
    program_json text,
    updated_at timestamp
);

CREATE TABLE IF NOT EXISTS astral.twitch_creator_programs_by_status (
    status text,
    updated_at timestamp,
    user_id bigint,
    twitch_user_id text,
    broadcaster_login text,
    broadcaster_display_name text,
    profile_image_url text,
    subscriber_perks_enabled boolean,
    program_json text,
    PRIMARY KEY (status, updated_at, user_id)
) WITH CLUSTERING ORDER BY (updated_at DESC, user_id ASC);

CREATE TABLE IF NOT EXISTS astral.twitch_eventsub_subscriptions (
    broadcaster_user_id text,
    event_type text,
    subscription_id text,
    status text,
    version text,
    condition_json text,
    last_synced_at timestamp,
    PRIMARY KEY (broadcaster_user_id, event_type)
);

CREATE TABLE IF NOT EXISTS astral.twitch_events_seen (
    message_id text PRIMARY KEY,
    event_type text,
    broadcaster_user_id text,
    received_at timestamp
);

CREATE TABLE IF NOT EXISTS astral.twitch_channel_events (
    broadcaster_user_id text,
    event_timestamp timestamp,
    message_id text,
    event_type text,
    payload_json text,
    PRIMARY KEY (broadcaster_user_id, event_timestamp, message_id)
) WITH CLUSTERING ORDER BY (event_timestamp DESC, message_id ASC);

CREATE TABLE IF NOT EXISTS astral.twitch_live_states (
    broadcaster_user_id text PRIMARY KEY,
    creator_user_id bigint,
    login text,
    display_name text,
    is_live boolean,
    stream_id text,
    stream_type text,
    started_at timestamp,
    ended_at timestamp,
    updated_at timestamp
);

CREATE TABLE IF NOT EXISTS astral.twitch_subscriber_perk_grants (
    creator_user_id bigint,
    viewer_user_id bigint,
    id text,
    creator_twitch_user_id text,
    creator_login text,
    creator_display_name text,
    viewer_twitch_user_id text,
    viewer_login text,
    viewer_display_name text,
    active boolean,
    tier text,
    is_gift boolean,
    reward_kind text,
    reward_name text,
    reward_description text,
    source text,
    created_at timestamp,
    granted_at timestamp,
    revoked_at timestamp,
    updated_at timestamp,
    last_event_at timestamp,
    PRIMARY KEY (creator_user_id, viewer_user_id)
);

CREATE TABLE IF NOT EXISTS astral.twitch_subscriber_perk_grants_by_viewer (
    viewer_user_id bigint,
    creator_user_id bigint,
    id text,
    creator_twitch_user_id text,
    creator_login text,
    creator_display_name text,
    viewer_twitch_user_id text,
    viewer_login text,
    viewer_display_name text,
    active boolean,
    tier text,
    is_gift boolean,
    reward_kind text,
    reward_name text,
    reward_description text,
    source text,
    created_at timestamp,
    granted_at timestamp,
    revoked_at timestamp,
    updated_at timestamp,
    last_event_at timestamp,
    PRIMARY KEY (viewer_user_id, creator_user_id)
);
