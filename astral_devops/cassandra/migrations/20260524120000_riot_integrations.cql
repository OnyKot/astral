CREATE TABLE IF NOT EXISTS astral.riot_connections (
    user_id bigint PRIMARY KEY,
    puuid text,
    game_name text,
    tag_line text,
    region text,
    rank_solo text,
    rank_flex text,
    summoner_id text,
    summoner_level int,
    profile_icon_id int,
    in_game boolean,
    current_champion text,
    connected_at timestamp,
    updated_at timestamp
);

CREATE TABLE IF NOT EXISTS astral.riot_connections_by_puuid (
    puuid text PRIMARY KEY,
    user_id bigint
);
