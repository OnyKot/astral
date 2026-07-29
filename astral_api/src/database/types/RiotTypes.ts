import type {UserID} from '~/BrandedTypes';

type Nullish<T> = T | null;

export interface RiotConnectionRow {
	user_id: UserID;
	puuid: string;
	game_name: string;
	tag_line: string;
	region: string;
	rank_solo: Nullish<string>;
	rank_flex: Nullish<string>;
	summoner_id: Nullish<string>;
	summoner_level: Nullish<number>;
	profile_icon_id: Nullish<number>;
	in_game: boolean;
	current_champion: Nullish<string>;
	connected_at: Date;
	updated_at: Date;
}

export interface RiotConnectionByPuuidRow {
	puuid: string;
	user_id: UserID;
}

export const RIOT_CONNECTION_COLUMNS = [
	'user_id',
	'puuid',
	'game_name',
	'tag_line',
	'region',
	'rank_solo',
	'rank_flex',
	'summoner_id',
	'summoner_level',
	'profile_icon_id',
	'in_game',
	'current_champion',
	'connected_at',
	'updated_at',
] as const satisfies ReadonlyArray<keyof RiotConnectionRow>;

export const RIOT_CONNECTION_BY_PUUID_COLUMNS = ['puuid', 'user_id'] as const satisfies ReadonlyArray<
	keyof RiotConnectionByPuuidRow
>;
