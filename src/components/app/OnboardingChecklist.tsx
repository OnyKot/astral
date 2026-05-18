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
	CheckCircleIcon,
	ChatCircleDotsIcon,
	PhoneCallIcon,
	PlusCircleIcon,
	SmileyIcon,
	UserCirclePlusIcon,
	UserPlusIcon,
	CaretDownIcon,
	XIcon,
} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import AppStorage from '~/lib/AppStorage';
import GuildStore from '~/stores/GuildStore';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import RelationshipStore from '~/stores/RelationshipStore';
import UserStore from '~/stores/UserStore';
import styles from './OnboardingChecklist.module.css';

/**
 * Floating onboarding checklist. Six-step nudge inspired by Mural's pattern
 * (they saw +10% week-one retention after replacing popups with an inline
 * checklist). Lives bottom-right on desktop, collapsible header + close
 * button for users who want it out of the way.
 *
 * Completion state is derived from stores we already have — no new backend
 * table for the MVP. Manual-flag items (first message, first call, invite
 * sent) are tracked in localStorage via `markStep`, wired from the relevant
 * action creators in Phase 1.5. For now they flip when the widget observes
 * a reasonable proxy: message count, call state, friend count.
 */

type StepId = 'avatar' | 'message' | 'community' | 'call' | 'invite' | 'status';

interface StepDef {
	id: StepId;
	title: string;
	hint: string;
	icon: React.ReactNode;
}

const STORAGE_PREFIX = 'astral:onboarding-checklist:v1:';
const DISMISS_SUFFIX = ':dismissed';
const COLLAPSED_SUFFIX = ':collapsed';
const MANUAL_FLAGS_SUFFIX = ':flags';

type ManualFlags = Partial<Record<StepId, boolean>>;

const readManualFlags = (userId: string): ManualFlags => {
	return AppStorage.getJSON<ManualFlags>(STORAGE_PREFIX + userId + MANUAL_FLAGS_SUFFIX, {}) ?? {};
};

const writeManualFlags = (userId: string, flags: ManualFlags) => {
	AppStorage.setJSON(STORAGE_PREFIX + userId + MANUAL_FLAGS_SUFFIX, flags);
};

/**
 * Public API for other modules to flip a step to "done" when the user
 * completes it — e.g. MessageActionCreators calls `markOnboardingStep('message')`
 * after the first send. Safe to call repeatedly; it's idempotent.
 */
export const markOnboardingStep = (step: StepId): void => {
	const userId = UserStore.currentUser?.id;
	if (!userId) return;
	const flags = readManualFlags(userId);
	if (flags[step]) return;
	flags[step] = true;
	writeManualFlags(userId, flags);
};

export const OnboardingChecklist = observer(() => {
	const {t} = useLingui();
	const user = UserStore.currentUser;
	const isMobile = MobileLayoutStore.isMobileLayout();

	// Hydrate from storage once we have a user id.
	const [dismissed, setDismissed] = React.useState(false);
	const [collapsed, setCollapsed] = React.useState(false);
	const [, forceRerender] = React.useReducer((x: number) => x + 1, 0);

	const userId = user?.id ?? null;

	React.useEffect(() => {
		if (!userId) return;
		setDismissed(AppStorage.getItem(STORAGE_PREFIX + userId + DISMISS_SUFFIX) === '1');
		setCollapsed(AppStorage.getItem(STORAGE_PREFIX + userId + COLLAPSED_SUFFIX) === '1');
	}, [userId]);

	const handleDismiss = React.useCallback(() => {
		if (!userId) return;
		AppStorage.setItem(STORAGE_PREFIX + userId + DISMISS_SUFFIX, '1');
		setDismissed(true);
	}, [userId]);

	const handleToggleCollapse = React.useCallback(() => {
		if (!userId) return;
		const next = !collapsed;
		AppStorage.setItem(STORAGE_PREFIX + userId + COLLAPSED_SUFFIX, next ? '1' : '0');
		setCollapsed(next);
	}, [userId, collapsed]);

	// Compute completion state fresh each render — cheap, and MobX re-runs
	// this whenever the observed stores change.
	const steps: Array<StepDef> = React.useMemo(
		() => [
			{
				id: 'avatar',
				title: t`Set your avatar`,
				hint: t`Pick a picture so friends recognize you.`,
				icon: <UserCirclePlusIcon weight="fill" />,
			},
			{
				id: 'message',
				title: t`Send your first message`,
				hint: t`Say hi in any chat — that's the fun part.`,
				icon: <ChatCircleDotsIcon weight="fill" />,
			},
			{
				id: 'community',
				title: t`Join a community`,
				hint: t`Find a server or create one for your friends.`,
				icon: <PlusCircleIcon weight="fill" />,
			},
			{
				id: 'call',
				title: t`Start a voice call`,
				hint: t`Jump into a channel or call someone directly.`,
				icon: <PhoneCallIcon weight="fill" />,
			},
			{
				id: 'invite',
				title: t`Invite a friend`,
				hint: t`Astral is better with the people you already talk to.`,
				icon: <UserPlusIcon weight="fill" />,
			},
			{
				id: 'status',
				title: t`Set a custom status`,
				hint: t`Let people know what you're up to.`,
				icon: <SmileyIcon weight="fill" />,
			},
		],
		[t],
	);

	const manualFlags = userId ? readManualFlags(userId) : {};

	const completed: Record<StepId, boolean> = {
		avatar: Boolean(user?.avatar),
		message: Boolean(manualFlags.message),
		// Any guild beyond the implicit personal namespace counts.
		community: GuildStore.getGuildIds().length > 0 || Boolean(manualFlags.community),
		call: Boolean(manualFlags.call),
		// Friend request sent OR accepted = user has reached out at least once.
		invite: RelationshipStore.getRelationships().length > 0 || Boolean(manualFlags.invite),
		status: Boolean(manualFlags.status),
	};

	const doneCount = steps.filter((s) => completed[s.id]).length;
	const totalCount = steps.length;
	const allDone = doneCount === totalCount;

	// Listen for custom events other code can fire to flip flags without
	// importing the widget directly (action creators don't want a UI import).
	React.useEffect(() => {
		const handler = (event: Event) => {
			const custom = event as CustomEvent<{step: StepId}>;
			if (!custom.detail?.step) return;
			markOnboardingStep(custom.detail.step);
			forceRerender();
		};
		window.addEventListener('astral:onboarding-step', handler);
		return () => window.removeEventListener('astral:onboarding-step', handler);
	}, []);

	if (!user || dismissed || isMobile) {
		return null;
	}

	// Auto-hide when everything is done and the user hasn't explicitly
	// dismissed — avoid cluttering the screen forever. Keep a brief
	// celebration state first (only if not collapsed).
	if (allDone && collapsed) {
		return null;
	}

	return (
		<div
			className={clsx(styles.root, collapsed && styles.rootCollapsed)}
			role="region"
			aria-label={t`Getting started`}
		>
			<header className={styles.header}>
				<button
					type="button"
					className={styles.headerButton}
					onClick={handleToggleCollapse}
					aria-expanded={!collapsed}
				>
					<div className={styles.headerLeft}>
						<div className={styles.progressRing}>
							<svg viewBox="0 0 36 36" className={styles.progressSvg} aria-hidden="true">
								<circle className={styles.progressTrack} cx="18" cy="18" r="15.9" />
								<circle
									className={styles.progressValue}
									cx="18"
									cy="18"
									r="15.9"
									strokeDasharray={`${(doneCount / totalCount) * 99.9} 99.9`}
								/>
							</svg>
							<span className={styles.progressLabel}>
								{doneCount}/{totalCount}
							</span>
						</div>
						<div className={styles.headerTexts}>
							<div className={styles.headerTitle}>
								{allDone ? <Trans>You're all set</Trans> : <Trans>Getting started</Trans>}
							</div>
							<div className={styles.headerSubtitle}>
								{allDone ? (
									<Trans>Nice work — you unlocked the essentials.</Trans>
								) : (
									<Trans>A few quick steps to make Astral yours.</Trans>
								)}
							</div>
						</div>
					</div>
					<CaretDownIcon
						weight="bold"
						className={clsx(styles.caret, collapsed && styles.caretCollapsed)}
						aria-hidden
					/>
				</button>
				<button
					type="button"
					className={styles.closeButton}
					onClick={handleDismiss}
					aria-label={t`Dismiss onboarding checklist`}
				>
					<XIcon weight="bold" />
				</button>
			</header>

			<ul className={clsx(styles.list, collapsed && styles.listCollapsed)}>
				{steps.map((step) => {
					const done = completed[step.id];
					return (
						<li key={step.id} className={clsx(styles.item, done && styles.itemDone)}>
							<div className={styles.itemIcon} aria-hidden>
								{done ? <CheckCircleIcon weight="fill" /> : step.icon}
							</div>
							<div className={styles.itemText}>
								<div className={styles.itemTitle}>{step.title}</div>
								{!done && <div className={styles.itemHint}>{step.hint}</div>}
							</div>
						</li>
					);
				})}
			</ul>
		</div>
	);
});
