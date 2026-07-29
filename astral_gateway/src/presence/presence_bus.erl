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

-module(presence_bus).
-behaviour(gen_server).

-include_lib("astral_gateway/include/timeout_config.hrl").

-export([
    start_link/0,
    subscribe/1,
    subscribe_many/1,
    unsubscribe/1,
    unsubscribe_many/1,
    publish/2
]).
-export([init/1, handle_call/3, handle_cast/2, handle_info/2, terminate/2, code_change/3]).

-type shard() :: #{pid := pid(), ref := reference()}.
-type state() :: #{shards := #{non_neg_integer() => shard()}, shard_count := pos_integer()}.

%% Routing table (tuple of pg scope names, one per shard) published by init/1 so
%% that subscribe/unsubscribe can resolve their shard in the CALLING process
%% instead of round-tripping through this node-global router.
-define(SCOPES_TERM_KEY, {?MODULE, scopes}).

-spec start_link() -> {ok, pid()} | {error, term()}.
start_link() ->
    gen_server:start_link({local, ?MODULE}, ?MODULE, [], []).

-spec subscribe(integer()) -> ok.
subscribe(UserId) when is_integer(UserId) ->
    join(UserId, self()).

%% Presence init subscribes to every friend and every group-DM recipient before
%% READY can be dispatched. Batching it means the caller resolves the routing
%% table once and never touches the router, instead of paying
%% caller -> router -> shard -> pg for each id.
-spec subscribe_many([integer()]) -> ok.
subscribe_many(UserIds) when is_list(UserIds) ->
    Pid = self(),
    %% usort: pg allows the same pid to join a group twice, and a duplicate
    %% membership would deliver every presence frame to the subscriber twice.
    lists:foreach(
        fun(UserId) -> join(UserId, Pid) end,
        lists:usort([UserId || UserId <- UserIds, is_integer(UserId)])
    ),
    ok.

-spec unsubscribe(integer()) -> ok.
unsubscribe(UserId) when is_integer(UserId) ->
    leave(UserId, self()).

-spec unsubscribe_many([integer()]) -> ok.
unsubscribe_many(UserIds) when is_list(UserIds) ->
    Pid = self(),
    lists:foreach(
        fun(UserId) -> leave(UserId, Pid) end,
        lists:usort([UserId || UserId <- UserIds, is_integer(UserId)])
    ),
    ok.

-spec publish(integer(), term()) -> ok.
publish(UserId, Payload) when is_integer(UserId) ->
    gen_server:call(?MODULE, {publish, UserId, Payload}, ?DEFAULT_GEN_SERVER_TIMEOUT).

-spec init(list()) -> {ok, state()}.
init([]) ->
    process_flag(trap_exit, true),
    {ShardCount, Source} = determine_shard_count(presence_bus_shards),
    Shards = start_shards(ShardCount, #{}),
    publish_scopes(ShardCount),
    maybe_log_shard_source(presence_bus, ShardCount, Source),
    {ok, #{shards => Shards, shard_count => ShardCount}}.

-spec handle_call(term(), gen_server:from(), state()) -> {reply, term(), state()}.
handle_call({subscribe, UserId, Pid}, _From, State) ->
    {Reply, NewState} = forward_call(UserId, {subscribe, UserId, Pid}, State),
    {reply, Reply, NewState};
handle_call({unsubscribe, UserId, Pid}, _From, State) ->
    {Reply, NewState} = forward_call(UserId, {unsubscribe, UserId, Pid}, State),
    {reply, Reply, NewState};
handle_call({publish, UserId, Payload}, _From, State) ->
    {Reply, NewState} = forward_call(UserId, {publish, UserId, Payload}, State),
    {reply, Reply, NewState};
handle_call(Request, _From, State) ->
    logger:warning("[presence_bus] unknown request ~p", [Request]),
    {reply, ok, State}.

-spec handle_cast(term(), state()) -> {noreply, state()}.
handle_cast(_Msg, State) ->
    {noreply, State}.

-spec handle_info(term(), state()) -> {noreply, state()}.
handle_info({'DOWN', Ref, process, _Pid, Reason}, State) ->
    Shards = maps:get(shards, State),
    case find_shard_by_ref(Ref, Shards) of
        {ok, Index} ->
            logger:warning("[presence_bus] shard ~p crashed: ~p", [Index, Reason]),
            {_Shard, NewState} = restart_shard(Index, State),
            {noreply, NewState};
        not_found ->
            {noreply, State}
    end;
handle_info({'EXIT', Pid, Reason}, State) ->
    Shards = maps:get(shards, State),
    case find_shard_by_pid(Pid, Shards) of
        {ok, Index} ->
            logger:warning("[presence_bus] shard ~p exited: ~p", [Index, Reason]),
            {_Shard, NewState} = restart_shard(Index, State),
            {noreply, NewState};
        not_found ->
            {noreply, State}
    end;
handle_info(_Info, State) ->
    {noreply, State}.

-spec terminate(term(), state()) -> ok.
terminate(_Reason, State) ->
    Shards = maps:get(shards, State),
    lists:foreach(
        fun(Shard) ->
            Pid = maps:get(pid, Shard),
            catch gen_server:stop(Pid, shutdown, 5000)
        end,
        maps:values(Shards)
    ),
    ok.

-spec code_change(term(), term(), term()) -> {ok, state()}.
code_change(_OldVsn, State, _Extra) when is_map(State) ->
    {ok, State};
code_change(_OldVsn, {state, Shards, ShardCount}, _Extra) ->
    ConvertedShards = maps:map(
        fun(_Index, {shard, Pid, Ref}) ->
            #{pid => Pid, ref => Ref}
        end,
        Shards
    ),
    {ok, #{shards => ConvertedShards, shard_count => ShardCount}}.

-spec determine_shard_count(atom()) -> {pos_integer(), configured | auto}.
determine_shard_count(ConfigKey) ->
    case astral_gateway_env:get(ConfigKey) of
        Value when is_integer(Value), Value > 0 ->
            {Value, configured};
        _ ->
            {default_shard_count(), auto}
    end.

-spec default_shard_count() -> pos_integer().
default_shard_count() ->
    Candidates = [
        erlang:system_info(logical_processors_available), erlang:system_info(schedulers_online)
    ],
    lists:max([C || C <- Candidates, is_integer(C), C > 0] ++ [1]).

-spec maybe_log_shard_source(atom(), pos_integer(), configured | auto) -> ok.
maybe_log_shard_source(Name, Count, configured) ->
    logger:info("[~p] starting with ~p shards (configured)", [Name, Count]),
    ok;
maybe_log_shard_source(Name, Count, auto) ->
    logger:info(
        "[~p] starting with ~p shards (auto, set astral_gateway_PRESENCE_BUS_SHARDS for cross-node consistency)",
        [Name, Count]
    ),
    ok.

-spec start_shards(pos_integer(), #{}) -> #{non_neg_integer() => shard()}.
start_shards(Count, Acc) ->
    lists:foldl(
        fun(Index, MapAcc) ->
            case start_shard(Index) of
                {ok, Shard} ->
                    maps:put(Index, Shard, MapAcc);
                {error, Reason} ->
                    logger:warning("[presence_bus] failed to start shard ~p: ~p", [Index, Reason]),
                    MapAcc
            end
        end,
        Acc,
        lists:seq(0, Count - 1)
    ).

-spec start_shard(non_neg_integer()) -> {ok, shard()} | {error, term()}.
start_shard(Index) ->
    case presence_bus_shard:start_link(Index) of
        {ok, Pid} ->
            Ref = erlang:monitor(process, Pid),
            {ok, #{pid => Pid, ref => Ref}};
        Error ->
            Error
    end.

-spec restart_shard(non_neg_integer(), state()) -> {shard(), state()}.
restart_shard(Index, State) ->
    case start_shard(Index) of
        {ok, Shard} ->
            Shards = maps:get(shards, State),
            Updated = State#{shards := maps:put(Index, Shard, Shards)},
            {Shard, Updated};
        {error, Reason} ->
            logger:error("[presence_bus] failed to restart shard ~p: ~p", [Index, Reason]),
            Dummy = #{pid => spawn(fun() -> exit(normal) end), ref => make_ref()},
            {Dummy, State}
    end.

-spec publish_scopes(pos_integer()) -> ok.
publish_scopes(ShardCount) ->
    %% Scope names are derived from the shard index, so they are stable across
    %% router restarts; only init/1 writes this term, never a request path (a
    %% persistent_term:put/2 triggers a global GC scan).
    Scopes = list_to_tuple([
        presence_bus_shard:scope_name(Index)
     || Index <- lists:seq(0, ShardCount - 1)
    ]),
    persistent_term:put(?SCOPES_TERM_KEY, Scopes),
    ok.

-spec scope_for(integer()) -> {ok, atom()} | error.
scope_for(UserId) ->
    case persistent_term:get(?SCOPES_TERM_KEY, undefined) of
        Scopes when is_tuple(Scopes), tuple_size(Scopes) > 0 ->
            %% Same key and same shard count as ensure_shard/2, so a caller-side
            %% join always lands in the scope the publish path reads.
            {ok, element(select_shard(UserId, tuple_size(Scopes)) + 1, Scopes)};
        _ ->
            error
    end.

-spec join(integer(), pid()) -> ok.
join(UserId, Pid) ->
    case scope_for(UserId) of
        {ok, Scope} ->
            case catch pg:join(Scope, {presence, UserId}, Pid) of
                ok ->
                    ok;
                _ ->
                    %% Scope missing or dead: fall back to the router, which
                    %% restarts the shard (and its pg scope) before joining.
                    forward({subscribe, UserId, Pid})
            end;
        error ->
            forward({subscribe, UserId, Pid})
    end.

-spec leave(integer(), pid()) -> ok.
leave(UserId, Pid) ->
    case scope_for(UserId) of
        {ok, Scope} ->
            case catch pg:leave(Scope, {presence, UserId}, Pid) of
                ok ->
                    ok;
                not_joined ->
                    ok;
                _ ->
                    forward({unsubscribe, UserId, Pid})
            end;
        error ->
            forward({unsubscribe, UserId, Pid})
    end.

-spec forward(term()) -> ok.
forward(Request) ->
    _ = gen_server:call(?MODULE, Request, ?DEFAULT_GEN_SERVER_TIMEOUT),
    ok.

-spec forward_call(term(), term(), state()) -> {term(), state()}.
forward_call(Key, Request, State) ->
    {Index, State1} = ensure_shard(Key, State),
    call_shard(Index, Request, State1).

-spec call_shard(non_neg_integer(), term(), state()) -> {term(), state()}.
call_shard(Index, Request, State) ->
    Shards = maps:get(shards, State),
    Shard = maps:get(Index, Shards),
    Pid = maps:get(pid, Shard),
    case catch gen_server:call(Pid, Request, ?DEFAULT_GEN_SERVER_TIMEOUT) of
        {'EXIT', _} ->
            {_Shard, State1} = restart_shard(Index, State),
            call_shard(Index, Request, State1);
        Reply ->
            {Reply, State}
    end.

-spec ensure_shard(term(), state()) -> {non_neg_integer(), state()}.
ensure_shard(Key, State) ->
    Count = maps:get(shard_count, State),
    Index = select_shard(Key, Count),
    ensure_shard_for_index(Index, State).

-spec ensure_shard_for_index(non_neg_integer(), state()) -> {non_neg_integer(), state()}.
ensure_shard_for_index(Index, State) ->
    Shards = maps:get(shards, State),
    case maps:get(Index, Shards, undefined) of
        undefined ->
            {_Shard, NewState} = restart_shard(Index, State),
            {Index, NewState};
        #{pid := Pid} when is_pid(Pid) ->
            case erlang:is_process_alive(Pid) of
                true ->
                    {Index, State};
                false ->
                    {_Shard, NewState} = restart_shard(Index, State),
                    {Index, NewState}
            end
    end.

-spec select_shard(term(), pos_integer()) -> non_neg_integer().
select_shard(Key, Count) when Count > 0 ->
    rendezvous_router:select(Key, Count).

-spec find_shard_by_ref(reference(), #{non_neg_integer() => shard()}) ->
    {ok, non_neg_integer()} | not_found.
find_shard_by_ref(Ref, Shards) ->
    maps:fold(
        fun
            (Index, #{ref := R}, _) when R =:= Ref -> {ok, Index};
            (_, _, Acc) -> Acc
        end,
        not_found,
        Shards
    ).

-spec find_shard_by_pid(pid(), #{non_neg_integer() => shard()}) ->
    {ok, non_neg_integer()} | not_found.
find_shard_by_pid(Pid, Shards) ->
    maps:fold(
        fun
            (Index, #{pid := P}, _) when P =:= Pid -> {ok, Index};
            (_, _, Acc) -> Acc
        end,
        not_found,
        Shards
    ).

-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

subscribe_publish_roundtrip_test() ->
    {ok, Pid} = maybe_start_for_test(),
    UserId = 99999,
    Payload = #{<<"status">> => <<"online">>},
    ?assertEqual(ok, subscribe(UserId)),
    ?assertEqual(ok, publish(UserId, Payload)),
    receive
        {presence, UserId, Payload} ->
            ok
    after 1000 ->
        ?assert(false)
    end,
    ?assertEqual(ok, unsubscribe(UserId)),
    ?assertEqual(ok, gen_server:stop(Pid)).

unsubscribe_stops_delivery_test() ->
    {ok, Pid} = maybe_start_for_test(),
    UserId = 88888,
    Payload = #{<<"status">> => <<"idle">>},
    subscribe(UserId),
    ?assertEqual(ok, unsubscribe(UserId)),
    ?assertEqual(ok, publish(UserId, Payload)),
    receive
        {presence, UserId, Payload} ->
            ?assert(false)
    after 300 ->
        ok
    end,
    ?assertEqual(ok, gen_server:stop(Pid)).

maybe_start_for_test() ->
    case whereis(?MODULE) of
        undefined -> start_link();
        Existing when is_pid(Existing) -> {ok, Existing}
    end.
-endif.
