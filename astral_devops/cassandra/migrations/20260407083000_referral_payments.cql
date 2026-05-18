ALTER TABLE astral.payments ADD referral_code text;

ALTER TABLE astral.payments ADD referrer_user_id bigint;

ALTER TABLE astral.payments ADD referral_reward_cents int;

CREATE TABLE IF NOT EXISTS astral.payments_by_referrer (
    referrer_user_id bigint,
    completed_at timestamp,
    checkout_session_id text,
    PRIMARY KEY ((referrer_user_id), completed_at, checkout_session_id)
);
