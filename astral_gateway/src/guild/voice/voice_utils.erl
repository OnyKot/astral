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

-module(voice_utils).

-export([
    build_voice_token_rpc_request/6,
    build_voice_token_rpc_request/7,
    build_voice_token_rpc_request/8,
    build_force_disconnect_rpc_request/4,
    build_update_participant_rpc_request/5,
    build_update_participant_permissions_rpc_request/5,
    add_geolocation_to_request/3,
    add_ip_to_request/2,
    compute_voice_permissions/3
]).

build_voice_token_rpc_request(GuildId, ChannelId, UserId, ConnectionId, Latitude, Longitude) ->
    BaseReq =
        case GuildId of
            null ->
                #{
                    <<"type">> => <<"voice_get_token">>,
                    <<"channel_id">> => integer_to_binary(ChannelId),
                    <<"user_id">> => integer_to_binary(UserId)
                };
            _ ->
                BaseMap = #{
                    <<"type">> => <<"voice_get_token">>,
                    <<"guild_id">> => integer_to_binary(GuildId),
                    <<"channel_id">> => integer_to_binary(ChannelId),
                    <<"user_id">> => integer_to_binary(UserId)
                },
                case ConnectionId of
                    null ->
                        BaseMap;
                    ConnectionId when is_binary(ConnectionId) ->
                        maps:put(<<"connection_id">>, ConnectionId, BaseMap);
                    ConnectionId when is_integer(ConnectionId) ->
                        maps:put(<<"connection_id">>, integer_to_binary(ConnectionId), BaseMap);
                    _ ->
                        BaseMap
                end
        end,

    add_geolocation_to_request(BaseReq, Latitude, Longitude).

%% Adds the client IP to the RPC request so the API can run its GeoIP gate
%% for TURN credential generation. No-op when Ip is null/undefined/empty —
%% keeps the request shape unchanged for callers without an IP.
add_ip_to_request(RequestMap, Ip) ->
    case Ip of
        Ip when is_binary(Ip) andalso Ip =/= <<>> ->
            maps:put(<<"ip">>, Ip, RequestMap);
        _ ->
            RequestMap
    end.

add_geolocation_to_request(RequestMap, Latitude, Longitude) ->
    case {Latitude, Longitude} of
        {Lat, Long} when is_binary(Lat) andalso is_binary(Long) ->
            maps:merge(RequestMap, #{
                <<"latitude">> => Lat,
                <<"longitude">> => Long
            });
        _ ->
            RequestMap
    end.

build_force_disconnect_rpc_request(GuildId, ChannelId, UserId, ConnectionId) ->
    BaseReq = #{
        <<"type">> => <<"voice_force_disconnect_participant">>,
        <<"channel_id">> => integer_to_binary(ChannelId),
        <<"user_id">> => integer_to_binary(UserId),
        <<"connection_id">> => ConnectionId
    },
    case GuildId of
        null ->
            BaseReq;
        _ ->
            maps:put(<<"guild_id">>, integer_to_binary(GuildId), BaseReq)
    end.

build_update_participant_rpc_request(GuildId, ChannelId, UserId, Mute, Deaf) ->
    BaseReq = #{
        <<"type">> => <<"voice_update_participant">>,
        <<"channel_id">> => integer_to_binary(ChannelId),
        <<"user_id">> => integer_to_binary(UserId),
        <<"mute">> => Mute,
        <<"deaf">> => Deaf
    },
    case GuildId of
        null ->
            BaseReq;
        _ ->
            maps:put(<<"guild_id">>, integer_to_binary(GuildId), BaseReq)
    end.

build_update_participant_permissions_rpc_request(
    GuildId, ChannelId, UserId, ConnectionId, VoicePermissions
) ->
    BaseReq = #{
        <<"type">> => <<"voice_update_participant_permissions">>,
        <<"channel_id">> => integer_to_binary(ChannelId),
        <<"user_id">> => integer_to_binary(UserId),
        <<"connection_id">> => ConnectionId,
        <<"can_speak">> => maps:get(can_speak, VoicePermissions, true),
        <<"can_stream">> => maps:get(can_stream, VoicePermissions, true),
        <<"can_video">> => maps:get(can_video, VoicePermissions, true)
    },
    case GuildId of
        null ->
            BaseReq;
        _ ->
            maps:put(<<"guild_id">>, integer_to_binary(GuildId), BaseReq)
    end.

-spec compute_voice_permissions(integer(), integer(), map()) -> map().
compute_voice_permissions(UserId, ChannelId, State) ->
    Permissions = guild_permissions:get_member_permissions(UserId, ChannelId, State),
    SpeakPerm = constants:speak_permission(),
    StreamPerm = constants:stream_permission(),
    AdminPerm = constants:administrator_permission(),

    IsAdmin = (Permissions band AdminPerm) =:= AdminPerm,
    CanSpeak = IsAdmin orelse ((Permissions band SpeakPerm) =:= SpeakPerm),
    CanStream = IsAdmin orelse ((Permissions band StreamPerm) =:= StreamPerm),

    HasVirtualAccess = guild_virtual_channel_access:has_virtual_access(UserId, ChannelId, State),
    FinalCanSpeak = CanSpeak orelse HasVirtualAccess,
    FinalCanStream = CanStream orelse HasVirtualAccess,

    #{
        can_speak => FinalCanSpeak,
        can_stream => FinalCanStream,
        can_video => FinalCanStream
    }.

build_voice_token_rpc_request(
    GuildId, ChannelId, UserId, ConnectionId, Latitude, Longitude, VoicePermissions
) ->
    build_voice_token_rpc_request(
        GuildId, ChannelId, UserId, ConnectionId, Latitude, Longitude, VoicePermissions, null
    ).

build_voice_token_rpc_request(
    GuildId, ChannelId, UserId, ConnectionId, Latitude, Longitude, VoicePermissions, Ip
) ->
    BaseReq = build_voice_token_rpc_request(
        GuildId, ChannelId, UserId, ConnectionId, Latitude, Longitude
    ),
    ReqWithIp = add_ip_to_request(BaseReq, Ip),
    maps:merge(ReqWithIp, #{
        <<"can_speak">> => maps:get(can_speak, VoicePermissions, true),
        <<"can_stream">> => maps:get(can_stream, VoicePermissions, true),
        <<"can_video">> => maps:get(can_video, VoicePermissions, true)
    }).
