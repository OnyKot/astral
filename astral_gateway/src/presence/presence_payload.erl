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

-module(presence_payload).

-export([build/6]).

build(UserData, Status, Mobile, Afk, CustomStatus, MusicActivity) ->
    StatusBin = ensure_status_binary(Status),
    #{
        <<"user">> => user_utils:normalize_user(UserData),
        <<"status">> => StatusBin,
        <<"mobile">> => Mobile,
        <<"afk">> => Afk,
        <<"custom_status">> => custom_status_for(StatusBin, CustomStatus),
        <<"music_activity">> => music_activity_for(StatusBin, MusicActivity)
    }.

ensure_status_binary(Status) when is_atom(Status) ->
    constants:status_type_atom(Status);
ensure_status_binary(Status) when is_binary(Status) ->
    Status;
ensure_status_binary(_) ->
    <<"offline">>.

custom_status_for(StatusBin, CustomStatus) ->
    case StatusBin of
        <<"offline">> ->
            null;
        <<"invisible">> ->
            null;
        _ ->
            normalize_custom_status(CustomStatus)
    end.

normalize_custom_status(null) ->
    null;
normalize_custom_status(CustomStatus) when is_map(CustomStatus) ->
    CustomStatus;
normalize_custom_status(_) ->
    null.

music_activity_for(StatusBin, MusicActivity) ->
    case StatusBin of
        <<"offline">> ->
            null;
        <<"invisible">> ->
            null;
        _ ->
            normalize_music_activity(MusicActivity)
    end.

normalize_music_activity(null) ->
    null;
normalize_music_activity(MusicActivity) when is_map(MusicActivity) ->
    MusicActivity;
normalize_music_activity(_) ->
    null.
