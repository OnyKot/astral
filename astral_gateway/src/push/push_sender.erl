%% Copyright (C) 2026 Astral Contributors
%%
%% This file is part of Astral.
%%
%% Astral is free software: you can redistribute it and/or modify
%% it under the terms of the GNU Affero General Public License as published by
%% the Free Software Foundation, either version 3 of the License, or
%% (at your option) any later version.
%%
%% Astral is distributed in the hope that it will be useful,
%% but WITHOUT ANY WARRANTY; without even the implied warranty of
%% MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
%% GNU Affero General Public License for more details.
%%
%% You should have received a copy of the GNU Affero General Public License
%% along with Astral. If not, see <https://www.gnu.org/licenses/>.

-module(push_sender).

-import(push_cache, [
    get_user_badge_count/2,
    cache_user_badge_count/4
]).
-import(rpc_client, [call/1]).

-export([send_to_user_subscriptions/9, send_push_notifications/8]).

-define(FCM_ENDPOINT_PREFIX, <<"fcm://">>).
-define(FCM_DEFAULT_API_URL, <<"https://fcm.googleapis.com/fcm/send">>).

send_to_user_subscriptions(
    UserId,
    Subscriptions,
    MessageData,
    GuildId,
    ChannelId,
    MessageId,
    GuildName,
    ChannelName,
    BadgeCount
) ->
    AuthorData = maps:get(<<"author">>, MessageData, #{}),
    AuthorUsername = maps:get(<<"username">>, AuthorData, <<"Unknown">>),
    AuthorAvatar = maps:get(<<"avatar">>, AuthorData, null),

    AuthorAvatarUrl =
        case AuthorAvatar of
            null -> push_utils:get_default_avatar_url(maps:get(<<"id">>, AuthorData, <<"0">>));
            Hash -> push_utils:construct_avatar_url(maps:get(<<"id">>, AuthorData, <<"0">>), Hash)
        end,

    NotificationPayload = push_notification:build_notification_payload(
        MessageData,
        GuildId,
        ChannelId,
        MessageId,
        GuildName,
        ChannelName,
        AuthorUsername,
        AuthorAvatarUrl,
        UserId,
        BadgeCount
    ),
    MaybeVapidCredentials = ensure_vapid_credentials(),
    FailedSubscriptions = lists:filtermap(
        fun(Sub) ->
            send_notification_to_subscription(UserId, Sub, NotificationPayload, MaybeVapidCredentials)
        end,
        Subscriptions
    ),
    case FailedSubscriptions of
        [] ->
            ok;
        _ ->
            logger:debug("[push] Deleting ~p failed subscriptions", [
                length(FailedSubscriptions)
            ]),
            push_subscriptions:delete_failed_subscriptions(FailedSubscriptions)
    end.
send_push_notifications(
    UserIds, MessageData, GuildId, ChannelId, MessageId, GuildName, ChannelName, State
) ->
    {BadgeCounts, StateWithBadgeCounts} = ensure_badge_counts(UserIds, State),
    {UncachedUsers, CachedState} = lists:foldl(
        fun(UserId, {Uncached, S}) ->
            Key = {subscriptions, UserId},
            PushSubscriptionsCache = maps:get(push_subscriptions_cache, S, #{}),
            case maps:is_key(Key, PushSubscriptionsCache) of
                true ->
                    Subscriptions = push_cache:get_user_push_subscriptions(UserId, S),
                    logger:debug(
                        "[push] Using cached subscriptions for user ~p (~p subs)",
                        [UserId, length(Subscriptions)]
                    ),
                    BadgeCount = maps:get(UserId, BadgeCounts, 0),
                    case Subscriptions of
                        [] ->
                            ok;
                        _ ->
                            send_to_user_subscriptions(
                                UserId,
                                Subscriptions,
                                MessageData,
                                GuildId,
                                ChannelId,
                                MessageId,
                                GuildName,
                                ChannelName,
                                BadgeCount
                            )
                    end,
                    {Uncached, S};
                false ->
                    {[UserId | Uncached], S}
            end
        end,
        {[], StateWithBadgeCounts},
        UserIds
    ),

    case UncachedUsers of
        [] ->
            CachedState;
        _ ->
            push_subscriptions:fetch_and_send_subscriptions(
                UncachedUsers,
                MessageData,
                GuildId,
                ChannelId,
                MessageId,
                GuildName,
                ChannelName,
                CachedState,
                BadgeCounts
            )
    end.

ensure_badge_counts(UserIds, State) ->
    Now = erlang:system_time(second),
    TTL = maps:get(badge_counts_ttl_seconds, State, 0),
    {CachedCounts, Missing} =
        lists:foldl(
            fun(UserId, {Acc, MissingAcc}) ->
                case get_user_badge_count(UserId, State) of
                    {Count, Timestamp} when TTL > 0, Now - Timestamp < TTL ->
                        {maps:put(UserId, Count, Acc), MissingAcc};
                    _ ->
                        {Acc, [UserId | MissingAcc]}
                end
            end,
            {#{}, []},
            UserIds
        ),
    UniqueMissing = lists:usort(Missing),
    case UniqueMissing of
        [] ->
            {CachedCounts, State};
        _ ->
            fetch_badge_counts(UniqueMissing, CachedCounts, State, Now)
    end.

fetch_badge_counts(UserIds, Counts, State, CachedAt) ->
    Request = #{
        <<"type">> => <<"get_badge_counts">>,
        <<"user_ids">> => [integer_to_binary(UserId) || UserId <- UserIds]
    },
    case call(Request) of
        {ok, Data} ->
            BadgeData = maps:get(<<"badge_counts">>, Data, #{}),
            lists:foldl(
                fun(UserId, {Acc, S}) ->
                    UserIdBin = integer_to_binary(UserId),
                    Count = normalize_badge_count(maps:get(UserIdBin, BadgeData, 0)),
                    NewState = cache_user_badge_count(UserId, Count, CachedAt, S),
                    {maps:put(UserId, Count, Acc), NewState}
                end,
                {Counts, State},
                UserIds
            );
        {error, Reason} ->
            logger:error("[push] Failed to fetch badge counts: ~p", [Reason]),
            {Counts, State}
    end.

normalize_badge_count(Value) when is_integer(Value), Value >= 0 ->
    Value;
normalize_badge_count(_) ->
    0.


-define(PUSH_TTL, <<"86400">>).

ensure_vapid_credentials() ->
    Email = astral_gateway_env:get(vapid_email),
    Public = astral_gateway_env:get(vapid_public_key),
    Private = astral_gateway_env:get(vapid_private_key),
    case {Email, Public, Private} of
        {Email0, Public0, Private0}
        when is_binary(Email0) andalso is_binary(Public0) andalso is_binary(Private0) andalso
                 byte_size(Public0) > 0 andalso byte_size(Private0) > 0 ->
            {ok, Email0, Public0, Private0};
        _ ->
            {error, "Missing VAPID credentials"}
    end.

send_notification_to_subscription(UserId, Subscription, Payload, MaybeVapidCredentials) ->
    case extract_subscription_fields(Subscription) of
        {ok, webpush, Endpoint, P256dhKey, AuthKey, SubscriptionId} ->
            send_webpush_notification(
                UserId,
                SubscriptionId,
                Endpoint,
                P256dhKey,
                AuthKey,
                Payload,
                MaybeVapidCredentials
            );
        {ok, fcm, Token, SubscriptionId} ->
            send_fcm_notification(UserId, SubscriptionId, Token, Payload);
        {error, Reason} ->
            logger:error("[push] Invalid subscription for user ~p: ~s", [UserId, Reason]),
            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"invalid_subscription">>}),
            false
    end.

extract_subscription_fields(Subscription) ->
    case
        {
            maps:get(<<"endpoint">>, Subscription, undefined),
            maps:get(<<"p256dh_key">>, Subscription, undefined),
            maps:get(<<"auth_key">>, Subscription, undefined),
            maps:get(<<"subscription_id">>, Subscription, undefined)
        }
    of
        {Endpoint, P256dhKey, AuthKey, SubscriptionId}
        when is_binary(Endpoint) andalso is_binary(SubscriptionId) ->
            case binary:match(Endpoint, ?FCM_ENDPOINT_PREFIX) of
                {0, _} ->
                    PrefixSize = byte_size(?FCM_ENDPOINT_PREFIX),
                    EndpointSize = byte_size(Endpoint),
                    case EndpointSize > PrefixSize of
                        true ->
                            Token = binary:part(Endpoint, PrefixSize, EndpointSize - PrefixSize),
                            {ok, fcm, Token, SubscriptionId};
                        false ->
                            {error, "empty fcm token"}
                    end;
                nomatch when is_binary(P256dhKey) andalso is_binary(AuthKey) ->
                    {ok, webpush, Endpoint, P256dhKey, AuthKey, SubscriptionId};
                nomatch ->
                    {error, "missing webpush keys"}
            end;
        _ ->
            {error, "missing keys"}
    end.

build_push_headers(VapidToken, VapidPublicKey) ->
    [
        {<<"TTL">>, ?PUSH_TTL},
        {<<"Content-Type">>, <<"application/octet-stream">>},
        {<<"Content-Encoding">>, <<"aes128gcm">>},
        {<<"Authorization">>,
            <<"vapid t=", VapidToken/binary, ", k=", VapidPublicKey/binary>>}
    ].

send_webpush_notification(
    UserId,
    SubscriptionId,
    Endpoint,
    P256dhKey,
    AuthKey,
    Payload,
    MaybeVapidCredentials
) ->
    case MaybeVapidCredentials of
        {ok, VapidEmail, VapidPublicKey, VapidPrivateKey} ->
            logger:debug("[push] Sending webpush to endpoint ~p for user ~p", [Endpoint, UserId]),
            VapidClaims = #{
                <<"sub">> => <<"mailto:", VapidEmail/binary>>,
                <<"aud">> => push_utils:extract_origin(Endpoint),
                <<"exp">> => erlang:system_time(second) + 43200
            },
            VapidTokenResult =
                try
                    {ok, push_utils:generate_vapid_token(VapidClaims, VapidPublicKey, VapidPrivateKey)}
                catch
                    C:R ->
                        logger:error("[push] VAPID token generation failed: ~p:~p", [C, R]),
                        {error, {C, R}}
                end,
            case VapidTokenResult of
                {ok, VapidToken} ->
                    case push_utils:encrypt_payload(jsx:encode(Payload), P256dhKey, AuthKey, 4096) of
                        {ok, EncryptedBody} ->
                            Headers = build_push_headers(VapidToken, VapidPublicKey),
                            handle_webpush_response(UserId, SubscriptionId, Endpoint, Headers, EncryptedBody);
                        {error, EncryptError} ->
                            logger:error("[push] Failed to encrypt payload: ~p", [EncryptError]),
                            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"encryption_error">>}),
                            false
                    end;
                {error, _} ->
                    metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"vapid_error">>}),
                    false
            end;
        {error, Reason} ->
            logger:warning("[push] ~s - skipping webpush delivery", [Reason]),
            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"missing_vapid">>}),
            false
    end.

ensure_fcm_credentials() ->
    case astral_gateway_env:get(fcm_enabled) of
        true ->
            ServerKey = astral_gateway_env:get(fcm_server_key),
            ApiUrl =
                case astral_gateway_env:get(fcm_api_url) of
                    undefined -> ?FCM_DEFAULT_API_URL;
                    ApiUrlValue when is_binary(ApiUrlValue), byte_size(ApiUrlValue) > 0 ->
                        ApiUrlValue;
                    _ -> ?FCM_DEFAULT_API_URL
                end,
            case ServerKey of
                ServerKeyValue
                when is_binary(ServerKeyValue), byte_size(ServerKeyValue) > 0 ->
                    {ok, ApiUrl, ServerKeyValue};
                _ ->
                    {error, "Missing FCM server key"}
            end;
        _ ->
            {error, "FCM delivery is disabled"}
    end.

send_fcm_notification(UserId, SubscriptionId, Token, Payload) ->
    case ensure_fcm_credentials() of
        {ok, ApiUrl, ServerKey} ->
            Headers = [
                {<<"Content-Type">>, <<"application/json">>},
                {<<"Authorization">>, <<"key=", ServerKey/binary>>}
            ],
            Body = jsx:encode(build_fcm_payload(Token, Payload)),
            handle_fcm_response(UserId, SubscriptionId, ApiUrl, Headers, Body);
        {error, Reason} ->
            logger:warning("[push] ~s - skipping FCM delivery", [Reason]),
            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"fcm_not_configured">>}),
            false
    end.

build_fcm_payload(Token, Payload) ->
    Title = maps:get(<<"title">>, Payload, <<"Astral">>),
    Body = maps:get(<<"body">>, Payload, <<"">>),
    Icon = maps:get(<<"icon">>, Payload, undefined),
    Data = maps:get(<<"data">>, Payload, #{}),
    NotificationBase = #{
        <<"title">> => Title,
        <<"body">> => Body,
        <<"sound">> => <<"default">>
    },
    Notification =
        case Icon of
            IconBin when is_binary(IconBin), byte_size(IconBin) > 0 ->
                maps:put(<<"icon">>, IconBin, NotificationBase);
            _ ->
                NotificationBase
        end,
    #{
        <<"to">> => Token,
        <<"priority">> => <<"high">>,
        <<"content_available">> => true,
        <<"notification">> => Notification,
        <<"data">> => Data
    }.

handle_fcm_response(UserId, SubscriptionId, ApiUrl, Headers, Body) ->
    case hackney:request(post, binary_to_list(ApiUrl), Headers, Body, []) of
        {ok, Status, _, ClientRef} when Status >= 200, Status < 300 ->
            case hackney:body(ClientRef) of
                {ok, ResponseBody} ->
                    handle_fcm_success_body(UserId, SubscriptionId, ResponseBody);
                {error, Reason} ->
                    logger:error("[push] Failed to read FCM body for user ~p: ~p", [UserId, Reason]),
                    metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"fcm_body_read_error">>}),
                    false
            end;
        {ok, Status, _, ClientRef} ->
            ErrorBody =
                case hackney:body(ClientRef) of
                    {ok, Value} -> Value;
                    _ -> <<>>
                end,
            logger:error("[push] FCM push failed with status ~p for user ~p (%s)", [
                Status,
                UserId,
                ErrorBody
            ]),
            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"fcm_http_error">>}),
            false;
        {error, Reason} ->
            logger:error("[push] Failed to send FCM push for user ~p: ~p", [UserId, Reason]),
            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"fcm_network_error">>}),
            false
    end.

handle_fcm_success_body(UserId, SubscriptionId, Body) ->
    case catch jsx:decode(Body, [return_maps]) of
        {'EXIT', _} ->
            logger:warning("[push] Unable to parse FCM response body for user ~p", [UserId]),
            metrics_client:counter(<<"push.success">>, #{<<"provider">> => <<"fcm">>}),
            false;
        Decoded when is_map(Decoded) ->
            FailureCount = maps:get(<<"failure">>, Decoded, 0),
            case FailureCount of
                Value when is_integer(Value), Value > 0 ->
                    FcmError = extract_fcm_error(Decoded),
                    case should_delete_fcm_subscription(FcmError) of
                        true ->
                            logger:debug("[push] Invalid FCM token for user ~p (~p)", [UserId, FcmError]),
                            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"fcm_invalid_token">>}),
                            {true, delete_payload(UserId, SubscriptionId)};
                        false ->
                            logger:error("[push] FCM delivery failed for user ~p (~p)", [UserId, FcmError]),
                            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"fcm_delivery_error">>}),
                            false
                    end;
                _ ->
                    logger:debug("[push] FCM push sent successfully for user ~p", [UserId]),
                    metrics_client:counter(<<"push.success">>, #{<<"provider">> => <<"fcm">>}),
                    false
            end;
        _ ->
            metrics_client:counter(<<"push.success">>, #{<<"provider">> => <<"fcm">>}),
            false
    end.

extract_fcm_error(Decoded) ->
    Results = maps:get(<<"results">>, Decoded, []),
    case Results of
        [First | _] when is_map(First) ->
            maps:get(<<"error">>, First, undefined);
        _ ->
            undefined
    end.

should_delete_fcm_subscription(<<"NotRegistered">>) ->
    true;
should_delete_fcm_subscription(<<"InvalidRegistration">>) ->
    true;
should_delete_fcm_subscription(<<"MissingRegistration">>) ->
    true;
should_delete_fcm_subscription(<<"MismatchSenderId">>) ->
    true;
should_delete_fcm_subscription(_) ->
    false.

handle_webpush_response(UserId, SubscriptionId, Endpoint, Headers, Body) ->
    case hackney:request(post, binary_to_list(Endpoint), Headers, Body, []) of
        {ok, Status, _, _} when Status >= 200, Status < 300 ->
            logger:debug("[push] Push sent successfully (%p) for user %p", [Status, UserId]),
            metrics_client:counter(<<"push.success">>),
            false;
        {ok, 410, _, _} ->
            logger:debug("[push] Subscription expired (410) for user ~p", [UserId]),
            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"expired">>}),
            {true, delete_payload(UserId, SubscriptionId)};
        {ok, 404, _, _} ->
            logger:debug("[push] Subscription not found (404) for user ~p", [UserId]),
            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"not_found">>}),
            {true, delete_payload(UserId, SubscriptionId)};
        {ok, Status, _, ClientRef} ->
            {ok, ErrorBody} = hackney:body(ClientRef),
            logger:error("[push] Push failed with status ~p for user ~p (%s)", [
                Status,
                UserId,
                ErrorBody
            ]),
            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"http_error">>}),
            false;
        {error, Reason} ->
            logger:error("[push] Failed to send push for user ~p: ~p", [UserId, Reason]),
            metrics_client:counter(<<"push.failure">>, #{<<"reason">> => <<"network_error">>}),
            false
    end.

delete_payload(UserId, SubscriptionId) ->
    #{
        <<"user_id">> => integer_to_binary(UserId),
        <<"subscription_id">> => SubscriptionId
    }.
