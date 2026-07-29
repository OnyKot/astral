import type {RiotConnectionRow} from '~/database/CassandraTypes';
import {z} from '~/Schema';

export const RIOT_REGIONS = ['na1', 'euw1', 'eun1', 'kr', 'br1', 'la1', 'la2', 'oc1', 'tr1', 'ru', 'jp1'] as const;
export type RiotRegion = (typeof RIOT_REGIONS)[number];

export const RiotConnectRequest = z.object({
	game_name: z.string().min(1).max(16),
	tag_line: z.string().min(1).max(5),
	region: z.enum(RIOT_REGIONS),
});
export type RiotConnectRequest = z.infer<typeof RiotConnectRequest>;

export interface RiotConnectionResponse {
	puuid: string;
	gameName: string;
	tagLine: string;
	region: string;
	rankSolo: string | null;
	rankFlex: string | null;
	summonerLevel: number | null;
	profileIconId: number | null;
	inGame: boolean;
	currentChampion: string | null;
	connectedAt: number;
	updatedAt: number;
}

export interface RiotStatusResponse {
	configured: boolean;
	connection: RiotConnectionResponse | null;
}

export function rowToConnectionResponse(row: RiotConnectionRow): RiotConnectionResponse {
	return {
		puuid: row.puuid,
		gameName: row.game_name,
		tagLine: row.tag_line,
		region: row.region,
		rankSolo: row.rank_solo,
		rankFlex: row.rank_flex,
		summonerLevel: row.summoner_level,
		profileIconId: row.profile_icon_id,
		inGame: row.in_game,
		currentChampion: row.current_champion,
		connectedAt: row.connected_at.getTime(),
		updatedAt: row.updated_at.getTime(),
	};
}
