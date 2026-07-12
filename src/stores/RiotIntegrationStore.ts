import {makeAutoObservable, runInAction} from 'mobx';
import {Endpoints} from '~/Endpoints';
import http from '~/lib/HttpClient';
import {Logger} from '~/lib/Logger';

export const RIOT_OAUTH_RESULT_KEY = 'astral.riot.connect.result';

export interface RiotConnection {
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

interface RiotStatusResponse {
	configured: boolean;
	connection: RiotConnection | null;
}

interface RiotOAuthStartResponse {
	configured?: boolean;
	url?: string | null;
	state?: string | null;
	ok?: boolean;
	connection?: RiotConnection | null;
	error?: string;
}

function safeWindow(): Window | null {
	return typeof window === 'undefined' ? null : window;
}

class RiotIntegrationStore {
	configured = false;
	connection: RiotConnection | null = null;
	loading = false;
	error: string | null = null;
	private bootstrapped = false;
	private readonly logger = new Logger('RiotIntegrationStore');

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
		this.installOAuthBridges();
	}

	get isConnected(): boolean {
		return this.connection !== null;
	}

	async ensureBootstrapped(): Promise<void> {
		if (this.bootstrapped) return;
		this.bootstrapped = true;
		await this.refresh();
	}

	async refresh(): Promise<void> {
		runInAction(() => { this.loading = true; this.error = null; });
		try {
			const res = await http.get<RiotStatusResponse>({
				url: Endpoints.RIOT_CONNECTION,
				rejectWithError: false,
			});
			runInAction(() => {
				if (res.ok) {
					this.configured = Boolean(res.body.configured);
					this.connection = res.body.connection;
					this.error = null;
				} else {
					this.error = 'Failed to load Riot integration status.';
				}
				this.loading = false;
			});
		} catch (err) {
			runInAction(() => { this.loading = false; this.error = 'Failed to load'; });
			this.logger.error('refresh failed', err);
		}
	}

	async startConnect(): Promise<void> {
		runInAction(() => {
			this.loading = true;
			this.error = null;
		});

		try {
			const response = await http.post<RiotOAuthStartResponse>({
				url: Endpoints.RIOT_CONNECT,
				body: {},
				rejectWithError: false,
			});

			if (!response.ok) {
				runInAction(() => {
					this.loading = false;
					this.configured = response.status === 503 ? false : this.configured;
					this.error =
						response.status === 503
							? 'Riot integration is not configured on this server.'
							: 'Failed to start Riot connection.';
				});
				return;
			}

			const body = response.body ?? {};
			const oauthUrl = typeof body.url === 'string' && body.url.length > 0 ? body.url : null;
			if (oauthUrl) {
				runInAction(() => {
					this.loading = false;
					this.configured = body.configured ?? true;
				});
				safeWindow()?.open(oauthUrl, 'astral-riot-connect', 'width=560,height=760');
				return;
			}

			runInAction(() => {
				this.loading = false;
				if (body.connection) {
					this.connection = body.connection;
					this.configured = body.configured ?? true;
					this.error = null;
					return;
				}
				this.error = body.error ?? 'Failed to start Riot connection.';
			});
		} catch (error) {
			this.logger.error('startConnect failed', error);
			runInAction(() => {
				this.loading = false;
				this.error = error instanceof Error ? error.message : 'Failed to start Riot connection.';
			});
		}
	}

	async connect(gameName: string, tagLine: string, region: string): Promise<{ok: boolean; error?: string}> {
		runInAction(() => { this.loading = true; this.error = null; });
		try {
			const res = await http.post<{ok: boolean; connection: RiotConnection | null; error?: string}>({
				url: Endpoints.RIOT_CONNECT,
				body: {game_name: gameName, tag_line: tagLine, region},
			});
			runInAction(() => {
				this.loading = false;
				if (res.body.ok && res.body.connection) {
					this.connection = res.body.connection;
				} else {
					this.error = res.body.error ?? 'Connection failed';
				}
			});
			return {ok: res.body.ok, error: res.body.error};
		} catch (err) {
			runInAction(() => { this.loading = false; this.error = 'Connection failed'; });
			return {ok: false, error: 'Connection failed'};
		}
	}

	async disconnect(): Promise<void> {
		runInAction(() => {
			this.loading = true;
			this.error = null;
		});
		try {
			const response = await http.delete<{configured?: boolean}>({
				url: Endpoints.RIOT_CONNECTION,
				rejectWithError: false,
			});
			runInAction(() => {
				this.loading = false;
				if (!response.ok) {
					this.error = 'Failed to disconnect Riot.';
					return;
				}
				this.connection = null;
				if (typeof response.body?.configured === 'boolean') {
					this.configured = response.body.configured;
				}
			});
		} catch (err) {
			runInAction(() => {
				this.loading = false;
				this.error = 'Failed to disconnect Riot.';
			});
			this.logger.error('disconnect failed', err);
		}
	}

	async refreshData(): Promise<void> {
		runInAction(() => {
			this.loading = true;
			this.error = null;
		});
		try {
			const res = await http.post<{connection: RiotConnection | null}>({
				url: Endpoints.RIOT_REFRESH,
				body: {},
				rejectWithError: false,
			});
			runInAction(() => {
				this.loading = false;
				if (!res.ok) {
					this.error = 'Failed to refresh Riot profile data.';
					return;
				}
				if (res.body.connection) this.connection = res.body.connection;
			});
		} catch (err) {
			runInAction(() => {
				this.loading = false;
				this.error = 'Failed to refresh Riot profile data.';
			});
			this.logger.error('refreshData failed', err);
		}
	}

	private installOAuthBridges(): void {
		const win = safeWindow();
		if (!win) return;

		win.addEventListener('storage', this.handleStorageEvent);
		win.addEventListener('message', this.handleWindowMessage);

		try {
			const pendingResult = win.localStorage.getItem(RIOT_OAUTH_RESULT_KEY);
			if (pendingResult) {
				this.consumeOAuthResult(pendingResult);
			}
		} catch {
			// localStorage can be unavailable in some embedded contexts.
		}
	}

	private handleStorageEvent(event: StorageEvent): void {
		if (event.key !== RIOT_OAUTH_RESULT_KEY || !event.newValue) return;
		this.consumeOAuthResult(event.newValue);
	}

	private handleWindowMessage(event: MessageEvent): void {
		if (typeof event.data !== 'object' || !event.data) return;
		if ((event.data as {type?: string}).type !== 'astral:riot:oauth') return;
		void this.refresh();
	}

	private consumeOAuthResult(raw: string): void {
		try {
			const payload = JSON.parse(raw) as {ok?: boolean; error?: string};
			safeWindow()?.localStorage.removeItem(RIOT_OAUTH_RESULT_KEY);

			if (payload.ok) {
				void this.refresh();
				return;
			}

			runInAction(() => {
				this.error = payload.error || 'Riot authorization failed.';
			});
		} catch {
			// Ignore malformed handoff payloads.
		}
	}
}

export default new RiotIntegrationStore();
