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

export const NagbarType = {
	UNCLAIMED_ACCOUNT: 'unclaimed-account',
	EMAIL_VERIFICATION: 'email-verification',
	PHONE_VERIFICATION: 'phone-verification',
	DESKTOP_NOTIFICATION: 'desktop-notification',
	PREMIUM_GRACE_PERIOD: 'premium-grace-period',
	PREMIUM_EXPIRED: 'premium-expired',
	PREMIUM_ONBOARDING: 'premium-onboarding',
	GIFT_INVENTORY: 'gift-inventory',
	BULK_DELETE_PENDING: 'bulk-delete-pending',
	DESKTOP_DOWNLOAD: 'desktop-download',
	MOBILE_DOWNLOAD: 'mobile-download',
	GUILD_MEMBERSHIP_CTA: 'guild-membership-cta',
} as const;

export type NagbarType = (typeof NagbarType)[keyof typeof NagbarType];

export interface NagbarState {
	type: NagbarType;
	priority: number;
	visible: boolean;
}

export interface AppLayoutState {
	isStandalone: boolean;
}

export interface NagbarConditions {
	userIsUnclaimed: boolean;
	userNeedsVerification: boolean;
	canShowPhoneVerification: boolean;
	canShowDesktopNotification: boolean;
	canShowPremiumGracePeriod: boolean;
	canShowPremiumExpired: boolean;
	canShowPremiumOnboarding: boolean;
	canShowGiftInventory: boolean;
	canShowDesktopDownload: boolean;
	canShowMobileDownload: boolean;
	hasPendingBulkMessageDeletion: boolean;
	canShowGuildMembershipCta: boolean;
}

export const UPDATE_DISMISS_KEY = 'Astral_update_dismissed_until';
export const PHONE_VERIFICATION_DISMISS_KEY = 'Astral_phone_verification_dismissed_until';
export const PHONE_VERIFICATION_GRACE_START_KEY = 'Astral_phone_verification_grace_started_at';
export const PHONE_VERIFICATION_MODAL_KEY = 'required-phone-verification';
export const PHONE_VERIFICATION_SNOOZE_MS = 2 * 24 * 60 * 60 * 1000;
