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

-module(astral_gateway_app).
-behaviour(application).
-export([start/2, stop/1]).

start(_StartType, _StartArgs) ->
    astral_gateway_env:load(),

    WsPort = astral_gateway_env:get(ws_port),
    RpcPort = astral_gateway_env:get(rpc_port),
    RpcBind = astral_gateway_env:get(rpc_bind),

    Dispatch = cowboy_router:compile([
        {'_', [
            {<<"/_health">>, health_handler, []},
            {<<"/">>, gateway_handler, []}
        ]}
    ]),

    {ok, _} = cowboy:start_clear(http, [{port, WsPort}], #{
        env => #{dispatch => Dispatch},
        max_frame_size => 4096
    }),

    %% The RPC/admin HTTP listener serves the internal RPC endpoint and
    %% the hot-reload code-loading endpoint. It must never bind to a
    %% public interface: the RPC secret authenticates _requests_ but the
    %% endpoint still exposes privileged cluster operations, and
    %% hot-reload is remote code execution. Bind to loopback only.
    %%
    %% hot_reload is an RCE surface (it loads arbitrary BEAM binaries).
    %% It is only mounted when GATEWAY_HOT_RELOAD_ENABLED=true is set
    %% explicitly, and even then requires GATEWAY_ADMIN_SECRET. In
    %% production it should stay disabled.
    HotReloadEnabled = astral_gateway_env:get(hot_reload_enabled),

    RpcRoutes = case HotReloadEnabled of
        true ->
            [
                {<<"/_rpc">>, gateway_rpc_http_handler, []},
                {<<"/_admin/reload">>, hot_reload_handler, []}
            ];
        _ ->
            [
                {<<"/_rpc">>, gateway_rpc_http_handler, []}
            ]
    end,

    RpcDispatch = cowboy_router:compile([{'_', RpcRoutes}]),

    {ok, _} = cowboy:start_clear(
        rpc_http,
        [
            {ip, RpcBind},
            {port, RpcPort}
        ],
        #{env => #{dispatch => RpcDispatch}}
    ),

    astral_gateway_sup:start_link().

stop(_State) ->
    ok.
