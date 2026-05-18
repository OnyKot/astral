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
import {BellIcon, TrayIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import React from 'react';
import {hasSeenDesktopDesignNotice} from '~/components/app/newDesktopDesignNoticeStorage';
import {InboxPopout} from '~/components/popouts/InboxPopout';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import {Popout} from '~/components/uikit/Popout/Popout';
import {Tooltip} from '~/components/uikit/Tooltip/Tooltip';
import {usePopout} from '~/hooks/usePopout';
import {ComponentDispatch} from '~/lib/ComponentDispatch';
import MobileLayoutStore from '~/stores/MobileLayoutStore';
import UserStore from '~/stores/UserStore';
import styles from '../ChannelHeader.module.css';
import {ChannelHeaderIcon} from './ChannelHeaderIcon';

interface InboxButtonProps {
	variant?: 'default' | 'voice';
}

const DesktopNewsBell = observer(({variant = 'default'}: InboxButtonProps) => {
	const {t} = useLingui();
	const username = UserStore.currentUser?.username;
	const isDesktop = !MobileLayoutStore.isMobileLayout();
	const [isVisible, setIsVisible] = React.useState(false);

	React.useEffect(() => {
		if (!isDesktop || !username) {
			setIsVisible(false);
			return;
		}
		setIsVisible(!hasSeenDesktopDesignNotice(username));
	}, [isDesktop, username]);

	const handleOpen = React.useCallback(() => {
		ComponentDispatch.dispatch('DESKTOP_DESIGN_NOTICE_OPEN');
		setIsVisible(false);
	}, []);

	if (!isVisible) {
		return null;
	}

	return (
		<Tooltip text={t`News`} position="bottom">
			<FocusRing offset={-2}>
				<button
					type="button"
					className={clsx(
						variant === 'voice' ? styles.iconButtonVoice : styles.iconButtonDefault,
						styles.newsBellButton,
					)}
					aria-label={t`News`}
					onClick={handleOpen}
				>
					<BellIcon
						className={clsx(
							variant === 'voice' ? styles.buttonIconVoice : styles.buttonIcon,
							styles.newsBellIcon,
						)}
						weight="fill"
					/>
					<span className={styles.newsBellDot} />
				</button>
			</FocusRing>
		</Tooltip>
	);
});

export const InboxButton = observer(({variant = 'default'}: InboxButtonProps) => {
	const {t} = useLingui();
	const {isOpen, openProps} = usePopout('inbox');

	return (
		<>
			<DesktopNewsBell variant={variant} />
			<Popout {...openProps} render={() => <InboxPopout />} position="bottom-end" subscribeTo="INBOX_OPEN">
				<ChannelHeaderIcon
					icon={TrayIcon}
					label={t`Inbox`}
					isSelected={isOpen}
					keybindAction="toggle_mentions_popout"
					variant={variant}
				/>
			</Popout>
		</>
	);
});
