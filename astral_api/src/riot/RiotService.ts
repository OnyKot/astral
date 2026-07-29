import type {UserID} from '~/BrandedTypes';
import {Config} from '~/Config';
import {Logger} from '~/Logger';
import {getRiotApiClient} from '~/riot/RiotApiClient';
import {rowToConnectionResponse, type RiotConnectionResponse, type RiotStatusResponse} from '~/riot/RiotModel';
import {RiotRepository} from '~/riot/RiotRepository';

const logger = Logger.child({service: 'RiotService'});

export class RiotService {
	private readonly repository = new RiotRepository();

	isConfigured(): boolean {
		return Boolean(Config.riot?.enabled && Config.riot?.apiKey);
	}

	async getStatus(userId: UserID): Promise<RiotStatusResponse> {
		const row = await this.repository.getConnection(userId);
		return {configured: this.isConfigured(), connection: row ? rowToConnectionResponse(row) : null};
	}

	async connect(userId: UserID, gameName: string, tagLine: string, region: string): Promise<{ok: boolean; connection: RiotConnectionResponse | null; error?: string}> {
		const client = getRiotApiClient();
		if (!client) return {ok: false, connection: null, error: 'riot_not_configured'};

		const account = await client.getAccount(gameName, tagLine, region);
		if (!account) return {ok: false, connection: null, error: 'account_not_found'};

		const summoner = await client.getSummonerByPuuid(account.puuid, region);
		const rank = summoner ? await client.getRank(summoner.id, region) : {soloRank: null, flexRank: null};
		const game = await client.getCurrentGame(account.puuid, region);

		const now = new Date();
		const existing = await this.repository.getConnection(userId);
		const row = {
			user_id: userId,
			puuid: account.puuid,
			game_name: account.gameName,
			tag_line: account.tagLine,
			region,
			rank_solo: rank.soloRank,
			rank_flex: rank.flexRank,
			summoner_id: summoner?.id ?? null,
			summoner_level: summoner?.summonerLevel ?? null,
			profile_icon_id: summoner?.profileIconId ?? null,
			in_game: game.inGame,
			current_champion: game.championName,
			connected_at: existing?.connected_at ?? now,
			updated_at: now,
		};

		await this.repository.upsertConnection(row, existing?.puuid);
		return {ok: true, connection: rowToConnectionResponse(row)};
	}

	async disconnect(userId: UserID): Promise<void> {
		await this.repository.deleteConnection(userId);
	}

	async refresh(userId: UserID): Promise<RiotConnectionResponse | null> {
		const existing = await this.repository.getConnection(userId);
		if (!existing) return null;

		const client = getRiotApiClient();
		if (!client) return rowToConnectionResponse(existing);

		try {
			const rank = existing.summoner_id
				? await client.getRank(existing.summoner_id, existing.region)
				: {soloRank: null, flexRank: null};
			const game = await client.getCurrentGame(existing.puuid, existing.region);

			const updated = {
				...existing,
				rank_solo: rank.soloRank,
				rank_flex: rank.flexRank,
				in_game: game.inGame,
				current_champion: game.championName,
				updated_at: new Date(),
			};
			await this.repository.upsertConnection(updated, existing.puuid);
			return rowToConnectionResponse(updated);
		} catch (err) {
			logger.warn({err, userId: userId.toString()}, '[RiotService] refresh failed');
			return rowToConnectionResponse(existing);
		}
	}
}
