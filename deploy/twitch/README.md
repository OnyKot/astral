# Twitch Integration Plan

This is the MVP plan for adding Twitch to Astral without mixing product work
with the Kubernetes migration.

## MVP

Build account linking first:

```text
User settings -> Streaming & Twitch -> Connect Twitch
```

Backend endpoints:

```text
GET   /api/v1/users/@me/integrations/twitch
POST  /api/v1/users/@me/integrations/twitch/oauth/start
GET   /api/integrations/twitch/oauth/callback
PATCH /api/v1/users/@me/integrations/twitch/settings
GET   /api/v1/users/@me/integrations/twitch/creator-program
PATCH /api/v1/users/@me/integrations/twitch/creator-program
GET   /api/v1/integrations/twitch/creator-programs
POST  /api/v1/users/@me/integrations/twitch/subscriber-perks/check
POST  /api/v1/users/@me/integrations/twitch/disconnect
```

The unversioned `/api/users/@me/integrations/twitch...` routes are also
accepted for local compatibility.

Initial user-facing data:

- Twitch user id
- login/display name
- profile image
- linked timestamp
- optional live status

## OAuth

Use Twitch OAuth authorization code flow because Astral has a backend that can
store the client secret safely.

Required env:

```env
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_REDIRECT_URI=https://astraof.com/api/integrations/twitch/oauth/callback
TWITCH_SCOPES=user:read:email
TWITCH_CREATOR_SCOPES=channel:read:subscriptions
TWITCH_EVENTSUB_SECRET=
```

Recommended initial scopes:

```text
user:read:email
```

If we only need public channel metadata/live status, use an app access token for
Helix API calls and keep user scopes minimal.

The current backend stores the user OAuth tokens outside the public profile
payload; clients only receive Twitch profile metadata and stream-mode settings.
Before production rollout, wire token-at-rest encryption if persistent user
tokens are required beyond this MVP.

## EventSub Later

Live notifications should be Phase 2:

```text
POST /api/integrations/twitch/eventsub
```

The handler must:

- verify Twitch HMAC signatures using the EventSub secret;
- respond to `webhook_callback_verification` with the raw challenge;
- acknowledge notifications quickly and process work asynchronously;
- deduplicate by Twitch message id.

## Data Model

Store Twitch connection separately from core user auth:

```text
user_twitch_connections
  user_id
  twitch_user_id
  login
  display_name
  profile_image_url
  access_token_encrypted
  refresh_token_encrypted
  scopes
  token_expires_at
  created_at
  updated_at
```

If we do not need long-lived user actions on Twitch, avoid storing refresh
tokens and use app tokens for status checks.

## Product Follow-ups

- show Twitch badge/profile link in user profile;
- optional "Live on Twitch" status;
- stream mode class for hiding sensitive UI during broadcasts;
- guild announcement channel for selected streamers;
- admin settings for Twitch integration health.

## Subscription-based Drops / Astral Subscription Rewards

Twitch supports Subscription-based Drops, where a viewer earns the Drop by
subscribing to a participating creator during a Drops campaign. This is not the
same as granting a Twitch subscription as a reward; the subscription is the
requirement, and our system fulfills the reward after Twitch grants the
entitlement.

Important constraint: Drops rewards are intended for non-transferable virtual
items or access that has no monetary value. Do not model a normal paid Astral
Premium subscription as an official Drops reward until legal/product confirms
that the reward is compliant. Safer reward shapes:

- limited creator badge;
- temporary cosmetic profile frame;
- closed-beta / early-access flag for a free feature;
- non-transferable creator campaign role in Astral;
- redeemable code for a non-monetary cosmetic.

If the business goal is "Twitch subscribers get Astral subscription-like
benefits", use one of two paths:

1. Official Drops path:
   - Astral must be configured as the relevant Twitch game/category under a
     Developer Organization.
   - Users link Astral + Twitch accounts.
   - Twitch campaign uses a Subscription-based Drop requirement.
   - Backend receives `drop.entitlement.grant` EventSub notifications.
   - Backend grants a compliant Astral reward, then marks the entitlement
     `FULFILLED` via `PATCH /helix/entitlements/drops`.

2. Subscriber-perk path outside Drops:
   - The creator connects Twitch with `channel:read:subscriptions`.
   - Backend subscribes to `channel.subscribe`,
     `channel.subscription.gift`, `channel.subscription.message`, and
     `channel.subscription.end` as needed.
   - Viewers link their Twitch account normally.
   - Backend verifies subscriber status with the creator token via
     `GET /helix/subscriptions?broadcaster_id=<creator>&user_id=<viewer>`.
   - Astral grants/revokes a creator perk based on current subscriber status.

Recommended MVP: build the subscriber-perk path first, because it works for
creator communities without requiring official Drops campaign approval and lets
us test the subscription benefit loop. Keep official Drops as a later marketing
campaign once Astral has an approved category/reward package.
