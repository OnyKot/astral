/*
 * Copyright (C) 2026 Astral Contributors
 *
 * This file is part of Astral.
 *
 * Astral is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Astral is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Astral. If not, see <https://www.gnu.org/licenses/>.
 */

import {Trans, useLingui} from '@lingui/react/macro';
import {
	ArrowClockwiseIcon,
	ArrowSquareOutIcon,
	CheckCircleIcon,
	CrownIcon,
	GiftIcon,
	ProjectorScreenIcon,
	ShieldCheckIcon,
	SparkleIcon,
	UsersThreeIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {Input, Textarea} from '~/components/form/Input';
import {Select} from '~/components/form/Select';
import {Switch} from '~/components/form/Switch';
import {SettingsSection} from '~/components/modals/shared/SettingsSection';
import {SettingsTabContainer, SettingsTabContent, SettingsTabHeader} from '~/components/modals/shared/SettingsTabLayout';
import {Button} from '~/components/uikit/Button/Button';
import TwitchIntegrationStore, {
	type TwitchCreatorRewardKind,
	type TwitchSubscriptionTier,
} from '~/stores/TwitchIntegrationStore';
import styles from './StreamingTab.module.css';

const TIER_OPTIONS: Array<{value: TwitchSubscriptionTier; label: string}> = [
	{value: '1000', label: 'Tier 1 / Prime'},
	{value: '2000', label: 'Tier 2'},
	{value: '3000', label: 'Tier 3'},
];

const REWARD_KIND_OPTIONS: Array<{value: TwitchCreatorRewardKind; label: string}> = [
	{value: 'badge', label: 'Creator badge'},
	{value: 'role', label: 'Community role'},
	{value: 'early_access', label: 'Early access'},
	{value: 'cosmetic', label: 'Cosmetic perk'},
	{value: 'custom', label: 'Custom perk'},
];

function formatDateTime(value: number): string {
	if (!value) return 'Never';
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(value);
}

const StreamingTab: React.FC = observer(() => {
	const {t} = useLingui();
	const [creatorLoginToCheck, setCreatorLoginToCheck] = React.useState('');
	const [audienceMode, setAudienceMode] = React.useState<'viewer' | 'streamer'>('viewer');

	React.useEffect(() => {
		void TwitchIntegrationStore.ensureBootstrapped();
	}, []);

	const connection = TwitchIntegrationStore.connection;
	const loading = TwitchIntegrationStore.status === 'loading';
	const configured = TwitchIntegrationStore.configured;
	const connected = TwitchIntegrationStore.isConnected;
	const creatorProgram = TwitchIntegrationStore.creatorProgram;
	const hasCreatorScope = TwitchIntegrationStore.hasCreatorSubscriptionScope;
	const creatorProgramSaving = TwitchIntegrationStore.creatorProgramStatus === 'loading';
	const eventSubLoading = TwitchIntegrationStore.eventSubStatus === 'loading';
	const subscriberCheckLoading = TwitchIntegrationStore.subscriberCheckStatus === 'loading';
	const liveState = TwitchIntegrationStore.liveState;
	const eventSubSubscriptions = creatorProgram.eventSubSubscriptions ?? [];
	const activeEventSubSubscriptions = eventSubSubscriptions.filter((subscription) => subscription.status === 'enabled').length;

	const statusLabel = !configured
		? t`Server setup required`
		: connected
			? t`Connected`
			: t`Ready to connect`;

	const statusText = !configured
		? t`Add TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET to the backend environment.`
		: connected
			? t`Astral can now use this Twitch channel for stream-aware features.`
			: t`Connect a Twitch account to prepare live detection and stream announcements.`;

	return (
		<SettingsTabContainer>
			<SettingsTabHeader
				title={t`Streaming & Twitch`}
				description={t`Connect Twitch and tune how Astral behaves when you go live, share your screen, or enter stream mode.`}
			/>

			<SettingsTabContent>
				<section className={styles.hero}>
					<div className={styles.heroIcon}>
						<ProjectorScreenIcon size={24} weight="fill" />
					</div>
					<div className={styles.heroCopy}>
						<div className={styles.heroEyebrow}>
							<Trans>Creator Mode</Trans>
						</div>
						<h3 className={styles.heroTitle}>
							<Trans>One control surface for Astral calls and Twitch live moments</Trans>
						</h3>
						<p className={styles.heroDescription}>
							<Trans>
								This is the first integration layer: OAuth connection, stream-mode preferences, and server-side status storage.
								EventSub live hooks and chat actions can attach to the same connection next.
							</Trans>
						</p>
					</div>
				</section>

				<div className={styles.audienceSwitch} role="tablist" aria-label={t`Twitch integration mode`}>
					<button
						type="button"
						role="tab"
						aria-selected={audienceMode === 'viewer'}
						className={clsx(styles.audienceButton, audienceMode === 'viewer' && styles.audienceButtonActive)}
						onClick={() => setAudienceMode('viewer')}
					>
						<GiftIcon size={16} weight="fill" />
						<span>
							<Trans>For viewers</Trans>
						</span>
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={audienceMode === 'streamer'}
						className={clsx(styles.audienceButton, audienceMode === 'streamer' && styles.audienceButtonActive)}
						onClick={() => setAudienceMode('streamer')}
					>
						<CrownIcon size={16} weight="fill" />
						<span>
							<Trans>For streamers</Trans>
						</span>
					</button>
				</div>

				{TwitchIntegrationStore.error && (
					<div className={styles.errorBanner} role="status">
						{TwitchIntegrationStore.error}
					</div>
				)}

				<SettingsSection
					id="twitch-account"
					title={t`Twitch account`}
					description={t`The backend uses Twitch OAuth authorization code flow, so the client secret stays on the server.`}
				>
					<div className={styles.connectionCard}>
						<div className={styles.connectionIdentity}>
							<div className={clsx(styles.avatar, !connection?.profileImageUrl && styles.avatarEmpty)}>
								{connection?.profileImageUrl ? (
									<img src={connection.profileImageUrl} alt="" className={styles.avatarImage} />
								) : (
									<ProjectorScreenIcon size={22} weight="fill" />
								)}
							</div>
							<div className={styles.connectionCopy}>
								<div className={styles.connectionTitle}>{connection?.displayName || t`Twitch is not connected`}</div>
								<div className={styles.connectionMeta}>
									{connection?.login ? `@${connection.login}` : statusText}
								</div>
							</div>
						</div>

						<div className={styles.connectionStatus}>
							<div className={clsx(styles.statusPill, connected && styles.statusPillConnected)}>
								{connected ? <CheckCircleIcon size={14} weight="fill" /> : <SparkleIcon size={14} weight="fill" />}
								<span>{statusLabel}</span>
							</div>
							<div className={styles.statusText}>{statusText}</div>
						</div>

						<div className={styles.actions}>
							{connected ? (
								<Button variant="danger-secondary" small onClick={() => void TwitchIntegrationStore.disconnect()} submitting={loading}>
									<XIcon size={15} weight="bold" />
									<Trans>Disconnect</Trans>
								</Button>
							) : (
								<Button small onClick={() => void TwitchIntegrationStore.startOAuth()} submitting={loading} disabled={!configured && loading}>
									<ArrowSquareOutIcon size={15} weight="bold" />
									<Trans>Connect Twitch</Trans>
								</Button>
							)}
							<Button variant="secondary" small onClick={() => void TwitchIntegrationStore.refresh()} disabled={loading}>
								<ArrowClockwiseIcon size={15} weight="bold" />
								<Trans>Refresh</Trans>
							</Button>
						</div>
					</div>
				</SettingsSection>

				{audienceMode === 'viewer' ? (
					<>
						<SettingsSection
							id="subscriber-perk-check"
							title={t`Subscriber access check`}
							description={t`Verify whether your linked Twitch account unlocks a creator's Astral perk.`}
						>
							<div className={styles.checkCard}>
								<div className={styles.checkRow}>
									<Input
										label={t`Creator Twitch login`}
										value={creatorLoginToCheck}
										placeholder={connection?.login || 'twitchdev'}
										maxLength={80}
										onChange={(event) => setCreatorLoginToCheck(event.currentTarget.value)}
									/>
									<Button
										small
										onClick={() => void TwitchIntegrationStore.checkSubscriberPerk(creatorLoginToCheck)}
										disabled={!creatorLoginToCheck.trim() || !connected || subscriberCheckLoading}
										submitting={subscriberCheckLoading}
									>
										<UsersThreeIcon size={15} weight="bold" />
										<Trans>Check access</Trans>
									</Button>
								</div>

								{TwitchIntegrationStore.subscriberCheckResult && (
									<div
										className={clsx(
											styles.resultCard,
											TwitchIntegrationStore.subscriberCheckResult.eligible && styles.resultCardEligible,
										)}
									>
										<div className={styles.resultIcon}>
											{TwitchIntegrationStore.subscriberCheckResult.eligible ? (
												<GiftIcon size={18} weight="fill" />
											) : (
												<ShieldCheckIcon size={18} weight="fill" />
											)}
										</div>
										<div>
											<div className={styles.resultTitle}>
												{TwitchIntegrationStore.subscriberCheckResult.eligible
													? t`Perk unlocked`
													: t`Perk is not unlocked`}
											</div>
											<div className={styles.resultText}>
												{TwitchIntegrationStore.subscriberCheckResult.eligible
													? t`Astral verified the Twitch subscription requirement.`
													: TwitchIntegrationStore.subscriberCheckResult.reason}
											</div>
										</div>
									</div>
								)}

								<div className={styles.grantsSummary}>
									<div>
										<div className={styles.summaryValue}>{TwitchIntegrationStore.viewerGrants.length}</div>
										<div className={styles.summaryLabel}>
											<Trans>Perks unlocked for you</Trans>
										</div>
									</div>
									<div>
										<div className={styles.summaryValue}>{TwitchIntegrationStore.creatorPrograms.length}</div>
										<div className={styles.summaryLabel}>
											<Trans>Creators available</Trans>
										</div>
									</div>
									<Button
										variant="secondary"
										small
										onClick={() => {
											void TwitchIntegrationStore.refreshCreatorPrograms();
											void TwitchIntegrationStore.refreshSubscriberPerkGrants();
										}}
										disabled={!connected}
									>
										<ArrowClockwiseIcon size={15} weight="bold" />
										<Trans>Refresh</Trans>
									</Button>
								</div>

								{TwitchIntegrationStore.subscriberCheckError && (
									<div className={styles.errorBanner} role="status">
										{TwitchIntegrationStore.subscriberCheckError}
									</div>
								)}
							</div>
						</SettingsSection>
					</>
				) : (
					<>
						<SettingsSection
							id="streamer-program"
							title={t`Streamer program`}
							description={t`Turn this Twitch channel into a subscriber-perk source for Astral communities.`}
						>
							<div className={styles.creatorGrid}>
								<div className={styles.scopePanel}>
									<div className={styles.scopeIcon}>
										<CrownIcon size={20} weight="fill" />
									</div>
									<div className={styles.scopeCopy}>
										<div className={styles.scopeTitle}>
											<Trans>Streamer permissions</Trans>
										</div>
										<div className={styles.scopeText}>
											{hasCreatorScope ? (
												<Trans>Astral can verify Twitch channel subscriptions for this creator.</Trans>
											) : (
												<Trans>Upgrade Twitch OAuth with channel subscription read access to verify subscribers.</Trans>
											)}
										</div>
									</div>
									<div className={clsx(styles.statusPill, hasCreatorScope && styles.statusPillConnected)}>
										{hasCreatorScope ? <CheckCircleIcon size={14} weight="fill" /> : <ShieldCheckIcon size={14} weight="fill" />}
										<span>{hasCreatorScope ? t`Ready` : t`Scope needed`}</span>
									</div>
									<Button
										variant="secondary"
										small
										onClick={() => void TwitchIntegrationStore.startOAuth('creator')}
										disabled={!configured || loading}
									>
										<ArrowSquareOutIcon size={15} weight="bold" />
										<Trans>Upgrade permissions</Trans>
									</Button>
								</div>

								<div className={styles.switchStack}>
									<Switch
										value={creatorProgram.enabled}
										onChange={(value) => void TwitchIntegrationStore.updateCreatorProgram({enabled: value})}
										label={t`Enable streamer workspace`}
										description={t`Publish this Twitch channel as an Astral creator source.`}
										disabled={!connected || creatorProgramSaving}
									/>
									<Switch
										value={creatorProgram.subscriberPerksEnabled}
										onChange={(value) => void TwitchIntegrationStore.updateCreatorProgram({subscriberPerksEnabled: value})}
										label={t`Enable subscriber perks`}
										description={t`Allow linked Twitch subscribers to unlock the configured Astral perk.`}
										disabled={!connected || creatorProgramSaving}
									/>
									<Switch
										value={creatorProgram.autoVerifySubscribers}
										onChange={(value) => void TwitchIntegrationStore.updateCreatorProgram({autoVerifySubscribers: value})}
										label={t`Auto-verify subscribers`}
										description={t`Let Astral refresh subscriber access automatically once EventSub is attached.`}
										disabled={!connected || creatorProgramSaving}
									/>
									<Switch
										value={creatorProgram.allowGiftedSubscriptions}
										onChange={(value) => void TwitchIntegrationStore.updateCreatorProgram({allowGiftedSubscriptions: value})}
										label={t`Count gifted subscriptions`}
										description={t`Gifted Twitch subscriptions can unlock the same Astral perk.`}
										disabled={!connected || creatorProgramSaving}
									/>
								</div>

								<div className={styles.formGrid}>
									<Input
										label={t`Community name`}
										value={creatorProgram.communityName}
										placeholder={connection?.displayName || t`Creator community`}
										maxLength={80}
										disabled={!connected || creatorProgramSaving}
										onChange={(event) => void TwitchIntegrationStore.updateCreatorProgram({communityName: event.currentTarget.value})}
									/>
									<Select<TwitchSubscriptionTier>
										label={t`Minimum Twitch sub tier`}
										value={creatorProgram.minimumTier}
										options={TIER_OPTIONS}
										disabled={!connected || creatorProgramSaving}
										isSearchable={false}
										onChange={(value) => void TwitchIntegrationStore.updateCreatorProgram({minimumTier: value})}
									/>
									<Select<TwitchCreatorRewardKind>
										label={t`Astral perk type`}
										value={creatorProgram.rewardKind}
										options={REWARD_KIND_OPTIONS}
										disabled={!connected || creatorProgramSaving}
										isSearchable={false}
										onChange={(value) => void TwitchIntegrationStore.updateCreatorProgram({rewardKind: value})}
									/>
									<Input
										label={t`Perk name`}
										value={creatorProgram.rewardName}
										maxLength={80}
										disabled={!connected || creatorProgramSaving}
										onChange={(event) => void TwitchIntegrationStore.updateCreatorProgram({rewardName: event.currentTarget.value})}
									/>
								</div>

								<Textarea
									label={t`Perk description`}
									value={creatorProgram.rewardDescription}
									maxLength={240}
									minRows={3}
									maxRows={5}
									showCharacterCount
									disabled={!connected || creatorProgramSaving}
									onChange={(event) => void TwitchIntegrationStore.updateCreatorProgram({rewardDescription: event.currentTarget.value})}
								/>

								{TwitchIntegrationStore.creatorProgramError && (
									<div className={styles.errorBanner} role="status">
										{TwitchIntegrationStore.creatorProgramError}
									</div>
								)}
							</div>
						</SettingsSection>

						<SettingsSection
							id="stream-mode"
							title={t`Stream mode`}
							description={t`These preferences are available locally now and sync to the Twitch connection when it is connected.`}
						>
							<div className={styles.switchStack}>
								<Switch
									value={TwitchIntegrationStore.settings.streamModeEnabled}
									onChange={(value) => TwitchIntegrationStore.updateSettings({streamModeEnabled: value})}
									label={t`Enable stream mode`}
									description={t`Use a creator-safe app profile while recording or broadcasting.`}
								/>
								<Switch
									value={TwitchIntegrationStore.settings.hideSensitiveOverlay}
									onChange={(value) => TwitchIntegrationStore.updateSettings({hideSensitiveOverlay: value})}
									label={t`Hide sensitive overlays`}
									description={t`Prepare the app to suppress private call, DM, and account surfaces during live sessions.`}
								/>
								<Switch
									value={TwitchIntegrationStore.settings.mirrorScreenShare}
									onChange={(value) => TwitchIntegrationStore.updateSettings({mirrorScreenShare: value})}
									label={t`Mirror Astral screen share state`}
									description={t`Treat an active Astral screen share as a stream-mode signal.`}
								/>
							</div>
						</SettingsSection>

						<SettingsSection
							id="live-automation"
							title={t`Live automation`}
							description={t`The next backend worker will use these flags for EventSub live detection and server announcements.`}
						>
							<div className={styles.switchStack}>
								<div className={styles.eventSubPanel}>
									<div className={styles.eventSubHeader}>
										<div>
											<div className={styles.eventSubTitle}>
												<Trans>Twitch EventSub webhook</Trans>
											</div>
											<div className={styles.eventSubText}>
												{TwitchIntegrationStore.eventSubReady ? (
													<Trans>Twitch can now push live and subscriber events into Astral.</Trans>
												) : (
													<Trans>Sync EventSub after enabling the creator program and upgrading streamer permissions.</Trans>
												)}
											</div>
										</div>
										<div className={clsx(styles.statusPill, TwitchIntegrationStore.eventSubReady && styles.statusPillConnected)}>
											<CheckCircleIcon size={14} weight="fill" />
											<span>
												{TwitchIntegrationStore.eventSubReady
													? t`${activeEventSubSubscriptions} active`
													: eventSubSubscriptions.length
														? t`Pending`
														: t`Not synced`}
											</span>
										</div>
									</div>

									<div className={styles.actions}>
										<Button
											small
											onClick={() => void TwitchIntegrationStore.syncEventSub()}
											disabled={!connected || !creatorProgram.enabled || !hasCreatorScope || eventSubLoading}
											submitting={eventSubLoading}
										>
											<ArrowClockwiseIcon size={15} weight="bold" />
											<Trans>Sync EventSub</Trans>
										</Button>
										<Button
											variant="secondary"
											small
											onClick={() => void TwitchIntegrationStore.refreshLiveState()}
											disabled={!connected}
										>
											<ProjectorScreenIcon size={15} weight="bold" />
											<Trans>Refresh live state</Trans>
										</Button>
									</div>

									{eventSubSubscriptions.length > 0 && (
										<div className={styles.eventSubList}>
											{eventSubSubscriptions.slice(0, 5).map((subscription) => (
												<div className={styles.eventSubRow} key={`${subscription.type}-${subscription.id || subscription.status}`}>
													<span className={styles.eventSubType}>{subscription.type}</span>
													<span className={clsx(styles.eventSubStatus, subscription.status === 'enabled' && styles.eventSubStatusEnabled)}>
														{subscription.status}
													</span>
												</div>
											))}
										</div>
									)}

									{creatorProgram.eventSubLastSyncedAt > 0 && (
										<div className={styles.eventSubMeta}>
											<Trans>Last sync:</Trans> {formatDateTime(creatorProgram.eventSubLastSyncedAt)}
										</div>
									)}

									{(TwitchIntegrationStore.eventSubError || creatorProgram.eventSubLastError) && (
										<div className={styles.errorBanner} role="status">
											{TwitchIntegrationStore.eventSubError || creatorProgram.eventSubLastError}
										</div>
									)}
								</div>

								<div className={clsx(styles.liveStateCard, liveState?.isLive && styles.liveStateLive)}>
									<div className={styles.liveDot} />
									<div>
										<div className={styles.liveStateTitle}>
											{liveState?.isLive ? t`Live on Twitch` : t`Twitch channel is offline`}
										</div>
										<div className={styles.liveStateText}>
											{liveState
												? liveState.isLive
													? t`${liveState.displayName || liveState.login} started at ${formatDateTime(liveState.startedAt)}`
													: t`Last update: ${formatDateTime(liveState.updatedAt)}`
												: t`No live-state event has been received yet.`}
										</div>
									</div>
								</div>

								<div className={styles.grantsSummary}>
									<div>
										<div className={styles.summaryValue}>{TwitchIntegrationStore.creatorGrants.length}</div>
										<div className={styles.summaryLabel}>
											<Trans>Active grants from your channel</Trans>
										</div>
									</div>
									<div>
										<div className={styles.summaryValue}>{activeEventSubSubscriptions}</div>
										<div className={styles.summaryLabel}>
											<Trans>Active EventSub hooks</Trans>
										</div>
									</div>
									<Button
										variant="secondary"
										small
										onClick={() => void TwitchIntegrationStore.refreshSubscriberPerkGrants()}
										disabled={!connected}
									>
										<ArrowClockwiseIcon size={15} weight="bold" />
										<Trans>Refresh grants</Trans>
									</Button>
								</div>

								<Switch
									value={TwitchIntegrationStore.settings.autoDetectLive}
									onChange={(value) => TwitchIntegrationStore.updateSettings({autoDetectLive: value})}
									label={t`Auto-detect when Twitch goes live`}
									description={t`Keep Twitch live state ready for Astral presence, call tiles, and creator badges.`}
									disabled={!connected}
								/>
								<Switch
									value={TwitchIntegrationStore.settings.autoAnnounceLive}
									onChange={(value) => TwitchIntegrationStore.updateSettings({autoAnnounceLive: value})}
									label={t`Announce live sessions`}
									description={t`Allow Astral to post a live announcement to a selected community channel later.`}
									disabled={!connected}
								/>
								<Switch
									value={TwitchIntegrationStore.settings.showTwitchPresence}
									onChange={(value) => TwitchIntegrationStore.updateSettings({showTwitchPresence: value})}
									label={t`Show Twitch presence`}
									description={t`Use the connected Twitch channel as part of your public creator status.`}
									disabled={!connected}
								/>
							</div>
						</SettingsSection>
					</>
				)}

				<SettingsSection
					id="privacy"
					title={t`Connection notes`}
					description={t`Twitch tokens are stored only on the backend. The client receives channel profile and settings only.`}
				>
					<div className={styles.noteGrid}>
						<div className={styles.noteItem}>
							<ShieldCheckIcon size={18} weight="fill" />
							<div>
								<div className={styles.noteTitle}>
									<Trans>Server-side OAuth</Trans>
								</div>
								<div className={styles.noteText}>
									<Trans>Uses Twitch authorization code flow with CSRF state protection.</Trans>
								</div>
							</div>
						</div>
						<div className={styles.noteItem}>
							<ProjectorScreenIcon size={18} weight="fill" />
							<div>
								<div className={styles.noteTitle}>
									<Trans>Voice layer ready</Trans>
								</div>
								<div className={styles.noteText}>
									<Trans>Astral screen-share state can be wired into stream mode without changing the call engine.</Trans>
								</div>
							</div>
						</div>
					</div>
				</SettingsSection>
			</SettingsTabContent>
		</SettingsTabContainer>
	);
});

export default StreamingTab;
