import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type {FC} from 'react';
import {Button} from '~/components/uikit/Button/Button';
import {Switch} from '~/components/form/Switch';
import AndroidNotificationSettingsStore from '~/stores/AndroidNotificationSettingsStore';
import AndroidPermissionStore from '~/stores/AndroidPermissionStore';
import {openAndroidAppSettings} from '~/utils/AndroidPermissions';
import {
	ANDROID_NOTIFICATION_CALL_CHANNEL_ID,
	ANDROID_NOTIFICATION_MESSAGE_CHANNEL_ID,
	ANDROID_NOTIFICATION_MENTION_CHANNEL_ID,
	ANDROID_NOTIFICATION_SYSTEM_CHANNEL_ID,
	openAndroidAppNotificationSettings,
	openAndroidChannelNotificationSettings,
} from '~/utils/AndroidNotificationSettings';
import styles from './Notifications.module.css';

export const AndroidNotifications: FC = observer(() => {
	const {t} = useLingui();
	const store = AndroidNotificationSettingsStore;
	const permissionStore = AndroidPermissionStore;
	const callQuickActionsReady = store.systemNotificationsEnabled && store.settings.quickActions;
	const callActionsDescription = !store.systemNotificationsEnabled
		? t`Astral cannot surface incoming call controls in the Android shade until notifications are enabled for the app.`
		: store.settings.quickActions && store.settings.callFullscreen
			? t`Answer, decline, and return to calls from Android notifications even when the app is backgrounded.`
			: store.settings.quickActions
				? t`Quick action buttons are ready in the Android shade. Enable full-screen incoming calls if you also want stronger lockscreen takeover.`
				: t`Enable quick actions so Android can show answer and decline buttons directly in the notification shade.`;

	const openAppSettings = () => {
		void openAndroidAppNotificationSettings();
	};

	const openChannelSettings = (channelId: string) => {
		void openAndroidChannelNotificationSettings(channelId);
	};

	const openPermissionSettings = () => {
		void openAndroidAppSettings();
	};

	const permissionCards = [
		{
			key: 'camera' as const,
			title: t`Camera`,
			description: t`Needed for video chat, camera preview, and avatar capture flows.`,
		},
		{
			key: 'microphone' as const,
			title: t`Microphone`,
			description: t`Needed for voice chat, call answering, and microphone testing.`,
		},
		{
			key: 'notifications' as const,
			title: t`Notifications`,
			description: t`Needed for push messages, ringing calls, and Android heads-up alerts.`,
		},
		{
			key: 'bluetooth' as const,
			title: t`Bluetooth audio`,
			description: t`Needed on newer Android versions to detect and route Bluetooth headsets correctly.`,
		},
	];

	const getPermissionStatusLabel = (status: ReturnType<typeof permissionStore.getStatus>) => {
		switch (status) {
			case 'granted':
				return t`Granted`;
			case 'permanently-denied':
				return t`Blocked in Android settings`;
			case 'denied':
				return t`Needs access`;
			default:
				return t`Not required on this device`;
		}
	};

	return (
		<div className={styles.androidSection}>
			<div className={styles.androidHeader}>
				<div>
					<h2 className={styles.title}>{t`Android Notifications`}</h2>
					<p className={styles.description}>
						{t`Tune native Android alerts, heads-up behavior, lockscreen visibility, and call actions without leaving the app.`}
					</p>
				</div>
				<Button variant="secondary" small={true} onClick={openAppSettings}>
					{t`Open Android settings`}
				</Button>
			</div>

			{!store.systemNotificationsEnabled && (
				<div className={styles.androidWarningCard}>
					<h3 className={styles.androidCardTitle}>{t`Android notifications are turned off`}</h3>
					<p className={styles.androidCardDescription}>
						{t`Enable notifications for Astral in system settings first, otherwise sounds and call alerts will stay muted no matter what you choose here.`}
					</p>
				</div>
			)}

			<div className={styles.androidFeatureCard}>
				<div className={styles.androidFeatureHeader}>
					<div>
						<h3 className={styles.androidCardTitle}>{t`Call controls from the Android shade`}</h3>
						<p className={styles.androidCardDescription}>{callActionsDescription}</p>
					</div>
					<span
						className={`${styles.androidFeaturePill} ${callQuickActionsReady ? styles.androidFeaturePillActive : styles.androidFeaturePillMuted}`.trim()}
					>
						{callQuickActionsReady ? t`Ready` : t`Needs setup`}
					</span>
				</div>
				<div className={styles.androidFeatureActions}>
					<Button variant="secondary" small={true} onClick={() => openChannelSettings(ANDROID_NOTIFICATION_CALL_CHANNEL_ID)}>
						{t`Open call channel`}
					</Button>
					<Button variant="secondary" small={true} onClick={openAppSettings}>
						{t`Open Android settings`}
					</Button>
				</div>
			</div>

			<div className={styles.androidPermissionGrid}>
				{permissionCards.map(({key, title, description}) => {
					const status = permissionStore.getStatus(key);
					const needsAction = status === 'denied' || status === 'permanently-denied';

					return (
						<div key={key} className={styles.androidPermissionCard}>
							<div className={styles.androidPermissionMeta}>
								<h3 className={styles.androidCardTitle}>{title}</h3>
								<p className={styles.androidCardDescription}>{description}</p>
							</div>
							<div className={styles.androidPermissionFooter}>
								<span className={styles.androidPermissionStatus}>{getPermissionStatusLabel(status)}</span>
								{needsAction && (
									<Button
										variant="secondary"
										small={true}
										onClick={() =>
											status === 'denied'
												? void permissionStore.request(key)
												: void openPermissionSettings()
										}
									>
										{status === 'denied' ? t`Request access` : t`Open settings`}
									</Button>
								)}
							</div>
						</div>
					);
				})}
			</div>

			<div className={styles.switchesContainer}>
				<Switch
					label={t`Message sound`}
					description={t`Play the default Android notification sound for regular messages.`}
					value={store.settings.messageSound}
					onChange={(value) => void store.updateSetting('messageSound', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Message vibration`}
					description={t`Vibrate on regular message notifications.`}
					value={store.settings.messageVibrate}
					onChange={(value) => void store.updateSetting('messageVibrate', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Message heads-up`}
					description={t`Show regular messages as heads-up banners when Android allows it.`}
					value={store.settings.messageHeadsUp}
					onChange={(value) => void store.updateSetting('messageHeadsUp', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Mention sound`}
					description={t`Use a dedicated alert profile for mentions and targeted activity.`}
					value={store.settings.mentionSound}
					onChange={(value) => void store.updateSetting('mentionSound', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Mention vibration`}
					description={t`Vibrate for mentions and direct pings.`}
					value={store.settings.mentionVibrate}
					onChange={(value) => void store.updateSetting('mentionVibrate', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Mention heads-up`}
					description={t`Show mentions as higher-priority banners.`}
					value={store.settings.mentionHeadsUp}
					onChange={(value) => void store.updateSetting('mentionHeadsUp', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Call sound`}
					description={t`Play the ringtone channel for incoming calls.`}
					value={store.settings.callSound}
					onChange={(value) => void store.updateSetting('callSound', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Call vibration`}
					description={t`Vibrate on incoming calls and ringing call alerts.`}
					value={store.settings.callVibrate}
					onChange={(value) => void store.updateSetting('callVibrate', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Full-screen incoming calls`}
					description={t`Allow incoming calls to break through with Android full-screen call UI when the device is locked or backgrounded.`}
					value={store.settings.callFullscreen}
					onChange={(value) => void store.updateSetting('callFullscreen', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Show on lockscreen`}
					description={t`Let Android show call and notification content on the lockscreen.`}
					value={store.settings.showOnLockscreen}
					onChange={(value) => void store.updateSetting('showOnLockscreen', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`Quick actions`}
					description={t`Show answer and decline buttons directly in incoming call notifications.`}
					value={store.settings.quickActions}
					onChange={(value) => void store.updateSetting('quickActions', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`System sound`}
					description={t`Play notification sounds for account, security, and system alerts.`}
					value={store.settings.systemSound}
					onChange={(value) => void store.updateSetting('systemSound', value)}
					disabled={store.loading}
				/>
				<Switch
					label={t`System vibration`}
					description={t`Vibrate for account and system alerts.`}
					value={store.settings.systemVibrate}
					onChange={(value) => void store.updateSetting('systemVibrate', value)}
					disabled={store.loading}
				/>
			</div>

			<div className={styles.androidChannelGrid}>
				<Button variant="secondary" small={true} onClick={() => openChannelSettings(ANDROID_NOTIFICATION_MESSAGE_CHANNEL_ID)}>
					{t`Message channel`}
				</Button>
				<Button variant="secondary" small={true} onClick={() => openChannelSettings(ANDROID_NOTIFICATION_MENTION_CHANNEL_ID)}>
					{t`Mention channel`}
				</Button>
				<Button variant="secondary" small={true} onClick={() => openChannelSettings(ANDROID_NOTIFICATION_CALL_CHANNEL_ID)}>
					{t`Call channel`}
				</Button>
				<Button variant="secondary" small={true} onClick={() => openChannelSettings(ANDROID_NOTIFICATION_SYSTEM_CHANNEL_ID)}>
					{t`System channel`}
				</Button>
			</div>
		</div>
	);
});
