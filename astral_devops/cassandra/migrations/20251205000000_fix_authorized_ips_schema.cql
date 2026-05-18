CREATE TABLE IF NOT EXISTS astral.authorized_ips_v2 (
    user_id bigint,
    ip text,
    PRIMARY KEY (user_id, ip)
);
