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

-module(guild_voice_move).

-export([move_member/2]).
-export([send_voice_server_update_for_move/5]).
-export([send_voice_server_updates_for_move/4]).

-type guild_state() :: map().
-type move_request() :: #{
    user_id := integer(),
    moderator_id := integer(),
    channel_id := integer() | null,
    connection_id => binary() | null,
    mute := boolean(),
    deaf := boolean()
}.

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").
-endif.

-spec move_member(move_request(), guild_state()) -> {reply, map(), guild_state()}.
move_member(Request, State) ->
    #{
        user_id := UserId,
        moderator_id := ModeratorId,
        channel_id := ChannelIdRaw
    } = Request,
    ConnectionId = maps:get(connection_id, Request, null),
    ChannelId = normalize_channel_id(ChannelIdRaw),
    VoiceStates = voice_state_utils:voice_states(State),

    UserVoiceStates = find_user_voice_states(UserId, VoiceStates),

    case maps:size(UserVoiceStates) of
        0 ->
            {reply, gateway_errors:error(voice_user_not_in_voice), State};
        _ ->
            ConnectionsToMove = select_connections_to_move(
                ConnectionId, UserId, VoiceStates, UserVoiceStates
            ),
            handle_move(
                ConnectionsToMove, ChannelId, UserId, ModeratorId, ConnectionId, VoiceStates, State
            )
    end.

find_user_voice_states(UserId, VoiceStates) ->
    maps:filter(
        fun(_ConnId, VoiceState) ->
            voice_state_utils:voice_state_user_id(VoiceState) =:= UserId
        end,
        VoiceStates
    ).

select_connections_to_move(null, _UserId, _VoiceStates, UserVoiceStates) ->
    UserVoiceStates;
select_connections_to_move(ConnectionId, UserId, VoiceStates, _UserVoiceStates) ->
    case maps:get(ConnectionId, VoiceStates, undefined) of
        undefined ->
            #{};
        VoiceState ->
            case voice_state_utils:voice_state_user_id(VoiceState) of
                UserId ->
                    #{ConnectionId => VoiceState};
                _ ->
                    #{}
            end
    end.

handle_move(ConnectionsToMove, ChannelId, UserId, ModeratorId, ConnectionId, VoiceStates, State) ->
    logger:info(
        "[guild_voice_move] handle_move user_id=~p moderator_id=~p channel_id=~p connection_id=~p connections=~p",
        [UserId, ModeratorId, ChannelId, ConnectionId, maps:keys(ConnectionsToMove)]
    ),
    case maps:size(ConnectionsToMove) of
        0 ->
            Error =
                case ConnectionId of
                    null -> gateway_errors:error(voice_user_not_in_voice);
                    _ -> gateway_errors:error(voice_connection_not_found)
                end,
            {reply, Error, State};
        _ ->
            case ChannelId of
                null ->
                    handle_disconnect_move(ConnectionsToMove, UserId, VoiceStates, State);
                ChannelIdValue ->
                    handle_channel_move(
                        ConnectionsToMove, ChannelIdValue, UserId, ModeratorId, VoiceStates, State
                    )
            end
    end.

handle_disconnect_move(ConnectionsToMove, UserId, VoiceStates, State) ->
    force_disconnect_from_old_rooms(ConnectionsToMove, State),

    NewVoiceStates = maps:fold(
        fun(ConnId, _VoiceState, Acc) -> maps:remove(ConnId, Acc) end,
        VoiceStates,
        ConnectionsToMove
    ),
    NewState = maps:put(voice_states, NewVoiceStates, State),

    maps:foreach(
        fun(_ConnId, VoiceState) ->
            OldChannelIdBin = maps:get(<<"channel_id">>, VoiceState, null),
            DisconnectVoiceState = maps:put(<<"channel_id">>, null, VoiceState),
            guild_voice_broadcast:broadcast_voice_state_update(
                DisconnectVoiceState, NewState, OldChannelIdBin
            )
        end,
        ConnectionsToMove
    ),

    {reply, #{success => true, user_id => UserId, connections_moved => ConnectionsToMove},
        NewState}.

handle_channel_move(ConnectionsToMove, ChannelIdValue, UserId, ModeratorId, VoiceStates, State) ->
    logger:info(
        "[guild_voice_move] handle_channel_move user_id=~p moderator_id=~p target_channel_id=~p connections=~p",
        [UserId, ModeratorId, ChannelIdValue, maps:keys(ConnectionsToMove)]
    ),
    Channel = guild_voice_member:find_channel_by_id(ChannelIdValue, State),
    case Channel of
        undefined ->
            {reply, gateway_errors:error(voice_channel_not_found), State};
        _ ->
            ChannelType = maps:get(<<"type">>, Channel, 0),
            case constants:is_guild_rtc_channel_type(ChannelType) of
                true ->
                    check_move_permissions_and_execute(
                        ConnectionsToMove, ChannelIdValue, UserId, ModeratorId, VoiceStates, State
                    );
                false ->
                    {reply, gateway_errors:error(voice_channel_not_voice), State}
            end
    end.

check_move_permissions_and_execute(
    ConnectionsToMove, ChannelIdValue, _UserId, ModeratorId, VoiceStates, State
) ->
    ViewPerm = constants:view_channel_permission(),
    ConnectPerm = constants:connect_permission(),
    ModPerms = guild_permissions:get_member_permissions(ModeratorId, ChannelIdValue, State),
    ModHasConnect = (ModPerms band ConnectPerm) =:= ConnectPerm,
    ModHasView = (ModPerms band ViewPerm) =:= ViewPerm,

    case ModHasConnect andalso ModHasView of
        false ->
            {reply, gateway_errors:error(voice_moderator_missing_connect), State};
        true ->
            execute_move(ConnectionsToMove, ChannelIdValue, VoiceStates, State)
    end.

execute_move(ConnectionsToMove, ChannelIdValue, VoiceStates, State) ->
    NewVoiceStates = maps:fold(
        fun(ConnId, _VoiceState, Acc) -> maps:remove(ConnId, Acc) end,
        VoiceStates,
        ConnectionsToMove
    ),
    StateAfterDisconnect = maps:put(voice_states, NewVoiceStates, State),

    maps:foreach(
        fun(_ConnId, VoiceState) ->
            OldChannelIdBin = maps:get(<<"channel_id">>, VoiceState, null),
            DisconnectVoiceState = VoiceState#{
                <<"channel_id">> => null,
                <<"move_channel_id">> => integer_to_binary(ChannelIdValue)
            },
            guild_voice_broadcast:broadcast_voice_state_update(
                DisconnectVoiceState, StateAfterDisconnect, OldChannelIdBin
            )
        end,
        ConnectionsToMove
    ),

    %% Ghost cleanup, deferred. We intentionally kick LiveKit AFTER the
    %% VOICE_STATE_UPDATE + VOICE_SERVER_UPDATE sequence the client is
    %% expecting, not before. An earlier (synchronous / unspaced) attempt
    %% raced with the client's move state machine: the LiveKit disconnect
    %% event arrived before the client had processed the state update +
    %% new token, and the client treated it as a terminal voice session
    %% end — the user ended up "in the void". 3 s is long enough for the
    %% new VOICE_SERVER_UPDATE to have landed and the client to have
    %% switched rooms; the old-channel ghost tile cleans up then.
    schedule_delayed_force_disconnect(ConnectionsToMove, State),

    SessionData = extract_session_data(ConnectionsToMove),

    {reply,
        #{
            success => true,
            needs_token => true,
            session_data => SessionData,
            connections_to_move => ConnectionsToMove
        },
        StateAfterDisconnect}.

schedule_delayed_force_disconnect(ConnectionsToMove, State) ->
    GuildId = maps:get(id, State),
    maps:foreach(
        fun(ConnectionId, VoiceState) ->
            schedule_one_delayed(GuildId, ConnectionId, VoiceState)
        end,
        ConnectionsToMove
    ).

force_disconnect_from_old_rooms(ConnectionsToMove, State) ->
    GuildId = maps:get(id, State),
    maps:foreach(
        fun(ConnectionId, VoiceState) ->
            OldChannelIdBin = maps:get(<<"channel_id">>, VoiceState, null),
            UserId = voice_state_utils:voice_state_user_id(VoiceState),
            case {type_conv:to_integer(OldChannelIdBin), UserId} of
                {undefined, _} -> ok;
                {_, undefined} -> ok;
                {OldChannelId, _} ->
                    Req = voice_utils:build_force_disconnect_rpc_request(
                        GuildId, OldChannelId, UserId, ConnectionId
                    ),
                    case rpc_client:call(Req) of
                        {ok, _} -> ok;
                        {error, Reason} ->
                            logger:warning(
                                "[guild_voice_move] force-disconnect RPC failed (non-fatal): ~p",
                                [Reason]
                            )
                    end
            end
        end,
        ConnectionsToMove
    ).

schedule_one_delayed(GuildId, ConnectionId, VoiceState) ->
    OldChannelIdBin = maps:get(<<"channel_id">>, VoiceState, null),
    UserId = voice_state_utils:voice_state_user_id(VoiceState),
    case {OldChannelIdBin, UserId} of
        {null, _} ->
            ok;
        {_, undefined} ->
            ok;
        _ ->
            case type_conv:to_integer(OldChannelIdBin) of
                undefined ->
                    ok;
                OldChannelId ->
                    Req = voice_utils:build_force_disconnect_rpc_request(
                        GuildId, OldChannelId, UserId, ConnectionId
                    ),
                    spawn(fun() ->
                        %% Give the client ~3 s to process the VOICE_
                        %% STATE_UPDATE(null) → VOICE_SERVER_UPDATE(new)
                        %% → join-new-LiveKit-room sequence. Only then
                        %% kick the stale old-channel identity.
                        timer:sleep(3000),
                        case rpc_client:call(Req) of
                            {ok, _} ->
                                logger:debug(
                                    "[guild_voice_move] delayed force-disconnect user=~p conn=~p from channel=~p",
                                    [UserId, ConnectionId, OldChannelId]
                                );
                            {error, Reason} ->
                                logger:warning(
                                    "[guild_voice_move] delayed force-disconnect RPC failed (non-fatal): ~p",
                                    [Reason]
                                )
                        end
                    end),
                    ok
            end
    end.

extract_session_data(ConnectionsToMove) ->
    {_ConnectionIds, SessionData} = maps:fold(
        fun(ConnId, VoiceState, {AccConnIds, AccSessionData}) ->
            SessionInfo = guild_voice_state:extract_session_info_from_voice_state(
                ConnId, VoiceState
            ),
            {[ConnId | AccConnIds], [SessionInfo | AccSessionData]}
        end,
        {[], []},
        ConnectionsToMove
    ),
    SessionData.

-spec normalize_channel_id(term()) -> integer() | null.
normalize_channel_id(null) ->
    null;
normalize_channel_id(Value) ->
    case type_conv:to_integer(Value) of
        undefined -> null;
        Int -> Int
    end.

-spec member_user_id(map()) -> integer() | undefined.
member_user_id(Member) ->
    User = map_utils:ensure_map(maps:get(<<"user">>, map_utils:ensure_map(Member), #{})),
    map_utils:get_integer(User, <<"id">>, undefined).

-ifdef(TEST).

move_member_user_not_in_voice_test() ->
    Request = #{
        user_id => 10,
        moderator_id => 20,
        channel_id => null,
        mute => false,
        deaf => false
    },
    State = test_state(#{}),
    {reply, {error, not_found, voice_user_not_in_voice}, _} = move_member(Request, State).

find_user_voice_states_filters_test() ->
    VoiceStates = #{
        <<"conn-a">> => voice_state_fixture(10, 100, <<"conn-a">>),
        <<"conn-b">> => voice_state_fixture(11, 101, <<"conn-b">>)
    },
    Result = find_user_voice_states(10, VoiceStates),
    ?assertEqual(#{<<"conn-a">> => maps:get(<<"conn-a">>, VoiceStates)}, Result).

select_connections_to_move_specific_connection_test() ->
    VoiceStates = #{
        <<"conn-a">> => voice_state_fixture(10, 100, <<"conn-a">>),
        <<"conn-b">> => voice_state_fixture(11, 101, <<"conn-b">>)
    },
    Selected = select_connections_to_move(<<"conn-b">>, 11, VoiceStates, #{}),
    ?assertEqual(#{<<"conn-b">> => maps:get(<<"conn-b">>, VoiceStates)}, Selected),
    ?assertEqual(#{}, select_connections_to_move(<<"conn-b">>, 10, VoiceStates, #{})).

test_state(VoiceStates) ->
    #{
        id => 1,
        data => #{
            <<"members">> => [],
            <<"channels">> => []
        },
        voice_states => VoiceStates
    }.

voice_state_fixture(UserId, ChannelId, ConnId) ->
    #{
        <<"user_id">> => integer_to_binary(UserId),
        <<"channel_id">> => integer_to_binary(ChannelId),
        <<"connection_id">> => ConnId,
        <<"member">> => #{
            <<"user">> => #{<<"id">> => integer_to_binary(UserId)}
        }
    }.

-endif.

send_voice_server_update_for_move(GuildId, ChannelId, UserId, SessionId, GuildPid) ->
    case SessionId of
        undefined ->
            ok;
        _ ->
            case gen_server:call(GuildPid, {get_sessions}, 10000) of
                State when is_map(State) ->
                    VoicePermissions = voice_utils:compute_voice_permissions(
                        UserId, ChannelId, State
                    ),
                    case
                        guild_voice_connection:request_voice_token(
                            GuildId, ChannelId, UserId, VoicePermissions
                        )
                    of
                        {ok, TokenData} ->
                            Token = maps:get(token, TokenData),
                            Endpoint = maps:get(endpoint, TokenData),
                            ConnectionId = maps:get(connection_id, TokenData),
                            guild_voice_broadcast:broadcast_voice_server_update_to_session(
                                GuildId, ChannelId, SessionId, Token, Endpoint, ConnectionId, State
                            );
                        {error, _Reason} ->
                            ok
                    end;
                _ ->
                    ok
            end
    end.

send_voice_server_updates_for_move(GuildId, ChannelId, SessionDataList, GuildPid) ->
    lists:foreach(
        fun(SessionInfo) ->
            send_single_voice_server_update(GuildId, ChannelId, SessionInfo, GuildPid)
        end,
        SessionDataList
    ).

send_single_voice_server_update(GuildId, ChannelId, SessionInfo, GuildPid) ->
    SessionId = maps:get(session_id, SessionInfo),
    SelfMute = maps:get(self_mute, SessionInfo),
    SelfDeaf = maps:get(self_deaf, SessionInfo),
    SelfVideo = maps:get(self_video, SessionInfo),
    SelfStream = maps:get(self_stream, SessionInfo),
    IsMobile = maps:get(is_mobile, SessionInfo),
    Member = maps:get(member, SessionInfo),
    ServerMute = maps:get(<<"mute">>, Member, false),
    ServerDeaf = maps:get(<<"deaf">>, Member, false),
    case member_user_id(Member) of
        undefined ->
            logger:warning(
                "[guild_voice_move] Missing user_id in member while sending voice server update: ~p",
                [SessionInfo]
            ),
            ok;
        UserId ->
            case gen_server:call(GuildPid, {get_sessions}, 10000) of
                StateData when is_map(StateData) ->
                    VoicePermissions = voice_utils:compute_voice_permissions(
                        UserId, ChannelId, StateData
                    ),
                    case
                        guild_voice_connection:request_voice_token(
                            GuildId, ChannelId, UserId, VoicePermissions
                        )
                    of
                        {ok, TokenData} ->
                            Token = maps:get(token, TokenData),
                            Endpoint = maps:get(endpoint, TokenData),
                            NewConnectionId = maps:get(connection_id, TokenData),

                            PendingMetadata = #{
                                <<"user_id">> => UserId,
                                <<"guild_id">> => GuildId,
                                <<"channel_id">> => ChannelId,
                                <<"connection_id">> => NewConnectionId,
                                <<"session_id">> => SessionId,
                                <<"self_mute">> => SelfMute,
                                <<"self_deaf">> => SelfDeaf,
                                <<"self_video">> => SelfVideo,
                                <<"self_stream">> => SelfStream,
                                <<"is_mobile">> => IsMobile,
                                <<"server_mute">> => ServerMute,
                                <<"server_deaf">> => ServerDeaf,
                                <<"member">> => Member
                            },
                            gen_server:cast(
                                GuildPid,
                                {store_pending_connection, NewConnectionId, PendingMetadata}
                            ),

                            guild_voice_broadcast:broadcast_voice_server_update_to_session(
                                GuildId,
                                ChannelId,
                                SessionId,
                                Token,
                                Endpoint,
                                NewConnectionId,
                                StateData
                            );
                        {error, _Reason} ->
                            ok
                    end;
                _ ->
                    ok
            end
    end.
