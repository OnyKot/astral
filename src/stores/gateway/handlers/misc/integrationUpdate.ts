import SteamIntegrationStore from '~/stores/SteamIntegrationStore';
import TwitchIntegrationStore from '~/stores/TwitchIntegrationStore';

export function handleIntegrationUpdate(data: unknown): void {
	const payload = data as {type?: string};
	if (payload.type === 'steam') {
		void SteamIntegrationStore.refresh();
	} else if (payload.type === 'twitch') {
		void TwitchIntegrationStore.refreshLiveState();
	}
}
