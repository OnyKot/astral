import {Config} from '~/Config';
import {Logger} from '~/Logger';

// Riot API regions map to routing values
const ROUTING: Record<string, string> = {
	na1: 'americas', euw1: 'europe', eun1: 'europe', kr: 'asia',
	br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'sea',
	tr1: 'europe', ru: 'europe', jp1: 'asia',
};

export interface RiotAccount {
	puuid: string;
	gameName: string;
	tagLine: string;
}

export interface RiotSummoner {
	id: string;
	accountId: string;
	puuid: string;
	name: string;
	profileIconId: number;
	summonerLevel: number;
}

export interface RiotRank {
	soloRank: string | null;
	flexRank: string | null;
}

export interface RiotCurrentGame {
	inGame: boolean;
	championName: string | null;
}

const logger = Logger.child({service: 'RiotApiClient'});

export class RiotApiClient {
	constructor(private readonly apiKey: string) {}

	private async fetch<T>(url: string): Promise<T | null> {
		try {
			const res = await fetch(url, {
				headers: {'X-Riot-Token': this.apiKey},
				signal: AbortSignal.timeout(8000),
			});
			if (res.status === 404) return null;
			if (!res.ok) {
				logger.warn({status: res.status, url}, 'Riot API request failed');
				return null;
			}
			return res.json() as Promise<T>;
		} catch (err) {
			logger.warn({err, url}, 'Riot API fetch error');
			return null;
		}
	}

	async getAccount(gameName: string, tagLine: string, region: string): Promise<RiotAccount | null> {
		const routing = ROUTING[region] ?? 'europe';
		const data = await this.fetch<{puuid: string; gameName: string; tagLine: string}>(
			`https://${routing}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
		);
		if (!data) return null;
		return {puuid: data.puuid, gameName: data.gameName, tagLine: data.tagLine};
	}

	async getSummonerByPuuid(puuid: string, region: string): Promise<RiotSummoner | null> {
		return this.fetch<RiotSummoner>(
			`https://${region}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${encodeURIComponent(puuid)}`,
		);
	}

	async getRank(summonerId: string, region: string): Promise<RiotRank> {
		const data = await this.fetch<Array<{queueType: string; tier: string; rank: string}>>(
			`https://${region}.api.riotgames.com/lol/league/v4/entries/by-summoner/${encodeURIComponent(summonerId)}`,
		);
		if (!data) return {soloRank: null, flexRank: null};
		const solo = data.find((e) => e.queueType === 'RANKED_SOLO_5x5');
		const flex = data.find((e) => e.queueType === 'RANKED_FLEX_SR');
		const fmt = (e: {tier: string; rank: string} | undefined) => (e ? `${e.tier} ${e.rank}` : null);
		return {soloRank: fmt(solo), flexRank: fmt(flex)};
	}

	async getCurrentGame(puuid: string, region: string): Promise<RiotCurrentGame> {
		const data = await this.fetch<{participants: Array<{championName: string; puuid: string}>}>(
			`https://${region}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${encodeURIComponent(puuid)}`,
		);
		if (!data) return {inGame: false, championName: null};
		const me = data.participants.find((p) => p.puuid === puuid);
		return {inGame: true, championName: me?.championName ?? null};
	}
}

export function getRiotApiClient(): RiotApiClient | null {
	if (!Config.riot?.apiKey) return null;
	return new RiotApiClient(Config.riot.apiKey);
}
