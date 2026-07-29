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

import {observer} from 'mobx-react-lite';
import type React from 'react';
import * as Sheet from '~/components/uikit/Sheet/Sheet';

interface BottomSheetProps {
	isOpen: boolean;
	onClose: () => void;
	children: React.ReactNode;
	title?: string;
	initialSnap?: number | null;
	snapPoints?: Array<number>;
	disablePadding?: boolean;
	disableDefaultHeader?: boolean;
	zIndex?: number;
	showHandle?: boolean;
	showCloseButton?: boolean;
	surface?: 'primary' | 'secondary' | 'tertiary';
	headerSlot?: React.ReactNode;
	leadingAction?: React.ReactNode;
	trailingAction?: React.ReactNode;
	containerClassName?: string;
	contentClassName?: string;
	disableDrag?: boolean;
	disableDismiss?: boolean;
	avoidKeyboard?: boolean;
	backdropOpacity?: number;
	showBackdrop?: boolean;
	disableBackdropBlur?: boolean;
	animationPreset?: 'default' | 'keyboard-replacement' | 'content-replacement';
}

export const BottomSheet: React.FC<BottomSheetProps> = observer(
	({
		isOpen,
		onClose,
		children,
		title,
		initialSnap = 1,
		snapPoints = [0, 0.5, 0.8, 1],
		disablePadding = false,
		disableDefaultHeader = false,
		zIndex,
		showHandle = true,
		showCloseButton = true,
		surface = 'secondary',
		headerSlot,
		leadingAction,
		trailingAction,
		containerClassName,
		contentClassName,
		disableDrag = false,
		disableDismiss = false,
		avoidKeyboard = true,
		backdropOpacity,
		showBackdrop,
		disableBackdropBlur = false,
		animationPreset = 'default',
	}) => {
		const resolvedInitialSnap = initialSnap ?? undefined;
		const shouldRenderDefaultHeader =
			!disableDefaultHeader && (!!title || !!leadingAction || !!trailingAction || showCloseButton);
		const shouldRenderCompactHeader = disableDefaultHeader && showCloseButton;

		const renderTrailingContent = () => {
			if (!shouldRenderDefaultHeader) return undefined;
			if (trailingAction && showCloseButton) {
				return (
					<>
						{trailingAction}
						<Sheet.CloseButton onClick={onClose} />
					</>
				);
			}
			if (showCloseButton) {
				return <Sheet.CloseButton onClick={onClose} />;
			}
			return trailingAction;
		};

		return (
			<Sheet.Root
				isOpen={isOpen}
				onClose={onClose}
				snapPoints={snapPoints}
				initialSnap={resolvedInitialSnap}
				surface={surface}
				zIndex={zIndex}
				className={containerClassName}
				disableDrag={disableDrag}
				disableDismiss={disableDismiss}
				avoidKeyboard={avoidKeyboard}
				backdropOpacity={backdropOpacity}
				showBackdrop={showBackdrop}
				disableBackdropBlur={disableBackdropBlur}
				animationPreset={animationPreset}
			>
				{showHandle && <Sheet.Handle />}
				{shouldRenderDefaultHeader && (
					<Sheet.Header
						leading={leadingAction}
						trailing={renderTrailingContent()}
						safeAreaTop={!showHandle}
						after={headerSlot}
					>
						{title && <Sheet.Title>{title}</Sheet.Title>}
					</Sheet.Header>
				)}
				{shouldRenderCompactHeader && (
					<Sheet.Header
						border={false}
						padding="sm"
						safeAreaTop={!showHandle}
						trailing={<Sheet.CloseButton onClick={onClose} />}
						after={headerSlot}
					/>
				)}
				{!shouldRenderDefaultHeader && !shouldRenderCompactHeader && headerSlot}
				{disablePadding ? children : <Sheet.Content className={contentClassName}>{children}</Sheet.Content>}
			</Sheet.Root>
		);
	},
);
