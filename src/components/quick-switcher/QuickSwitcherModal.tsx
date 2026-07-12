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

import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {motion, useReducedMotion} from 'framer-motion';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as QuickSwitcherActionCreators from '~/actions/QuickSwitcherActionCreators';
import {QuickSwitcherResultTypes} from '~/Constants';
import {QuickSwitcherBottomSheet} from '~/components/bottomsheets/QuickSwitcherBottomSheet';
import {Input} from '~/components/form/Input';
import * as Modal from '~/components/modals/Modal';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {MentionBadge} from '~/components/uikit/MentionBadge';
import {Scroller, type ScrollerHandle} from '~/components/uikit/Scroller';
import {useListNavigation} from '~/hooks/useListNavigation';
import LayerManager from '~/stores/LayerManager';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import type {QuickSwitcherExecutableResult, QuickSwitcherResult} from '~/stores/QuickSwitcherStore';
import QuickSwitcherStore from '~/stores/QuickSwitcherStore';
import ReadStateStore from '~/stores/ReadStateStore';
import {
	createSections,
	getChannelId,
	getResultKey,
	getViewContext,
	handleContextMenu,
	PREFIX_HINTS,
	renderIcon,
	useQuickSwitcherInputFocus,
	useQuickSwitcherKeyboardHandling,
} from '~/utils/quick-switcher/QuickSwitcherModalUtils';
import quickStyles from './QuickSwitcherModal.module.css';

const ARC_EASE = [0.22, 1, 0.36, 1] as const;

function getContainerMotion(reducedMotion: boolean) {
	if (reducedMotion) {
		return {
			initial: {opacity: 0},
			animate: {opacity: 1},
			exit: {opacity: 0},
			transition: {duration: 0.12},
		};
	}

	return {
		/*
		 * Modal rises from below with a small scale pop. Exit mirrors the
		 * entrance but quicker so Escape feels responsive. Previously the
		 * exit was missing entirely — the modal just disappeared.
		 */
		initial: {opacity: 0, y: 18, scale: 0.985},
		animate: {opacity: 1, y: 0, scale: 1},
		exit: {opacity: 0, y: 10, scale: 0.99, transition: {duration: 0.16, ease: 'easeIn' as const}},
		transition: {duration: 0.28, ease: ARC_EASE},
	};
}

function getRowMotion(reducedMotion: boolean, index: number) {
	if (reducedMotion) {
		return {};
	}

	/*
	 * Each result row staggers in with a small delay based on its index
	 * (capped at 8 rows to avoid cumulative lag on large result sets).
	 * Combined with the container's own entrance animation this gives a
	 * quick "cascade" of options instead of all rows snapping at once.
	 */
	const staggerDelay = Math.min(index, 8) * 0.022;
	return {
		initial: {opacity: 0, x: -8},
		animate: {opacity: 1, x: 0},
		whileHover: {x: 2, scale: 1.004},
		whileTap: {scale: 0.992},
		transition: {duration: 0.22, ease: ARC_EASE, delay: staggerDelay},
	};
}

const ResultRow = observer(
	({
		result,
		index,
		isKeyboardSelected,
		isHovered,
		onHover,
		onMouseLeave,
		onConfirm,
		innerRef,
	}: {
		result: QuickSwitcherResult;
		index: number;
		isKeyboardSelected: boolean;
		isHovered: boolean;
		onHover: (index: number) => void;
		onMouseLeave: () => void;
		onConfirm: (result: QuickSwitcherExecutableResult) => void;
		innerRef?: React.Ref<HTMLButtonElement>;
	}) => {
		const reducedMotion = useReducedMotion() ?? false;

		if (result.type === QuickSwitcherResultTypes.HEADER) {
			return (
				<div key={getResultKey(result)} className={quickStyles.sectionHeader}>
					{result.title}
				</div>
			);
		}

		const executableResult = result as QuickSwitcherExecutableResult;
		const channelId = getChannelId(executableResult);
		const unreadCount = channelId ? ReadStateStore.getUnreadCount(channelId) : 0;
		const mentionCount = channelId ? ReadStateStore.getMentionCount(channelId) : 0;
		const hasUnread = unreadCount > 0 || mentionCount > 0;
		const isActive = isKeyboardSelected || isHovered;
		const isHighlight = hasUnread && !isActive;

		const handleMouseEnter = () => onHover(index);
		const handleClick = (event: React.MouseEvent) => {
			event.preventDefault();
			onConfirm(executableResult);
		};

		const iconRendered = renderIcon(
			executableResult,
			isHighlight,
			quickStyles.optionIcon,
			quickStyles.optionIconHighlight,
		);

		const key = getViewContext(executableResult)
			? `${executableResult.type}-${getViewContext(executableResult)}-${executableResult.id}`
			: `${executableResult.type}-${executableResult.id}`;

		return (
			<FocusRing offset={-2}>
				<motion.button
					type="button"
					className={clsx(quickStyles.option, isActive && quickStyles.optionActive)}
					ref={innerRef as React.ComponentProps<typeof motion.button>['ref']}
					onMouseEnter={handleMouseEnter}
					onMouseLeave={onMouseLeave}
					onMouseDown={(event) => event.preventDefault()}
					onClick={handleClick}
					onContextMenu={(event) => handleContextMenu(event, executableResult)}
					key={key}
					{...getRowMotion(reducedMotion, index)}
				>
					<div className={quickStyles.optionContent}>
						{iconRendered.type === 'avatar' ? (
							<div className={quickStyles.avatar}>{iconRendered.content}</div>
						) : iconRendered.type === 'guild' ? (
							<div className={quickStyles.guildIcon}>{iconRendered.content}</div>
						) : (
							iconRendered.content
						)}
						<div className={clsx(quickStyles.optionText, isHighlight && quickStyles.optionHighlight)}>
							<div className={quickStyles.optionTitle}>{executableResult.title}</div>
							{executableResult.subtitle && (
								<div className={quickStyles.optionDescription}>{executableResult.subtitle}</div>
							)}
						</div>
						{mentionCount > 0 && !isActive && <MentionBadge mentionCount={mentionCount} size="small" />}
					</div>
				</motion.button>
			</FocusRing>
		);
	},
);

const QuickSwitcherModalComponent: React.FC = observer(() => {
	const {t} = useLingui();
	const {isOpen, query, results, selectedIndex} = QuickSwitcherStore;
	const inputRef = React.useRef<HTMLInputElement>(null);
	const scrollerRef = React.useRef<ScrollerHandle>(null);
	const rowRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
	const shouldScrollToSelection = React.useRef(false);
	const isMobile = MobileLayoutStore.isMobileLayout();
	const reducedMotion = useReducedMotion() ?? false;

	const {
		keyboardFocusIndex,
		hoverIndexForRender,
		handleMouseEnter: handleHoverIndex,
		handleMouseLeave,
		setSelectedIndex: setKeyboardIndex,
	} = useListNavigation({
		itemCount: results.length,
		initialIndex: selectedIndex >= 0 ? selectedIndex : 0,
		loop: true,
	});

	if (rowRefs.current.length !== results.length) {
		rowRefs.current = Array(results.length).fill(null);
	}

	React.useEffect(() => {
		if (results.length === 0) {
			setKeyboardIndex(-1);
			handleMouseLeave();
			return;
		}
		const clamped = selectedIndex >= 0 ? Math.min(selectedIndex, results.length - 1) : 0;
		setKeyboardIndex(clamped);
	}, [handleMouseLeave, results.length, selectedIndex, setKeyboardIndex]);

	React.useEffect(() => {
		handleMouseLeave();
	}, [handleMouseLeave, results.length]);

	useQuickSwitcherKeyboardHandling(isOpen, isMobile, inputRef, query);
	useQuickSwitcherInputFocus(isOpen, isMobile, undefined, inputRef);

	const handleChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		QuickSwitcherActionCreators.search(event.target.value);
	}, []);

	const handleKeyDown = React.useCallback(async (event: React.KeyboardEvent<HTMLInputElement>) => {
		switch (event.key) {
			case 'ArrowDown':
				event.preventDefault();
				shouldScrollToSelection.current = true;
				QuickSwitcherActionCreators.moveSelection('down');
				break;
			case 'ArrowUp':
				event.preventDefault();
				shouldScrollToSelection.current = true;
				QuickSwitcherActionCreators.moveSelection('up');
				break;
			case 'Tab':
			case 'Enter':
				event.preventDefault();
				await QuickSwitcherActionCreators.confirmSelection();
				break;
			case 'Escape':
				event.preventDefault();
				QuickSwitcherActionCreators.hide();
				break;
			default:
				break;
		}
	}, []);

	const handleClose = React.useCallback(() => {
		if (LayerManager.hasType('contextmenu')) {
			return;
		}
		QuickSwitcherActionCreators.hide();
	}, []);

	const handleSelect = React.useCallback(
		(index: number) => {
			shouldScrollToSelection.current = false;
			handleHoverIndex(index);
		},
		[handleHoverIndex],
	);

	const handleConfirm = React.useCallback((result: QuickSwitcherExecutableResult) => {
		void QuickSwitcherActionCreators.switchTo(result);
	}, []);

	React.useEffect(() => {
		if (!shouldScrollToSelection.current || keyboardFocusIndex < 0) {
			shouldScrollToSelection.current = false;
			return;
		}
		shouldScrollToSelection.current = false;
		const node = rowRefs.current[keyboardFocusIndex];
		if (node) {
			scrollerRef.current?.scrollIntoViewNode({node: node as HTMLElement, padding: 32});
		}
	}, [keyboardFocusIndex]);

	const sections = React.useMemo(() => createSections(results), [results]);

	if (!isOpen) {
		return null;
	}

	if (isMobile) {
		return <QuickSwitcherBottomSheet isOpen={isOpen} onClose={QuickSwitcherActionCreators.hide} />;
	}

	return (
		<Modal.Root
			centered
			className={quickStyles.modalRoot}
			onClose={handleClose}
			initialFocusRef={inputRef}
			transitionPreset="instant"
		>
			<Modal.ScreenReaderLabel text={t`Quick Switcher`} />
			<motion.div className={quickStyles.container} {...getContainerMotion(reducedMotion)}>
				<div className={quickStyles.header}>
					<Input
						ref={inputRef}
						value={query}
						onChange={handleChange}
						onKeyDown={handleKeyDown}
						placeholder={t`Search for channels, people, or communities`}
						spellCheck={false}
						className={quickStyles.inputBackground}
					/>
				</div>
				<div className={quickStyles.list}>
					<Scroller
						ref={scrollerRef}
						className={quickStyles.scrollerContainer}
						overflow="scroll"
						fade={false}
						reserveScrollbarTrack={false}
						edgeFades
						key="quick-switcher-desktop-scroller"
					>
						{results.length === 0 ? (
							<div className={quickStyles.emptyState}>
								<div className={quickStyles.emptyStateTitle}>{t`No matches found`}</div>
								<div className={quickStyles.emptyStateHint}>
									{t`Try a different name or use @ / # / ! / * prefixes to filter results.`}
								</div>
							</div>
						) : (
							sections.map((section, sidx) => (
								<div key={`section-${sidx}`} className={quickStyles.section}>
									{section.header && <div className={quickStyles.sectionHeader}>{section.header.title}</div>}
									{section.rows.map(({result, index}) => (
										<ResultRow
											key={getResultKey(result)}
											result={result}
											index={index}
											isKeyboardSelected={index === keyboardFocusIndex}
											isHovered={index === hoverIndexForRender}
											onHover={handleSelect}
											onMouseLeave={handleMouseLeave}
											onConfirm={handleConfirm}
											innerRef={(node) => {
												rowRefs.current[index] = node;
											}}
										/>
									))}
								</div>
							))
						)}
					</Scroller>
				</div>
				<div className={quickStyles.footer}>
					<span className={quickStyles.footerLabel}>{t`Filter by:`}</span>
					{PREFIX_HINTS.map((hint, idx) => (
						<span
							key={hint.symbol}
							className={
								idx < PREFIX_HINTS.length - 1
									? quickStyles.filterHintContainerWithMargin
									: quickStyles.filterHintContainer
							}
						>
							<span className={quickStyles.hintPill}>{hint.symbol}</span>
							<span>{t(hint.label)}</span>
						</span>
					))}
				</div>
			</motion.div>
		</Modal.Root>
	);
});

export const QuickSwitcherModal = Object.assign(QuickSwitcherModalComponent, {
	disableBackdropOnMobile: true,
});
