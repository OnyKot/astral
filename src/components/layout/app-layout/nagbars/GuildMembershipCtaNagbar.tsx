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

import {Trans} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import React from 'react';
import * as InviteActionCreators from '~/actions/InviteActionCreators';
import * as ModalActionCreators from '~/actions/ModalActionCreators';
import {modal} from '~/actions/ModalActionCreators';
import {Nagbar} from '~/components/layout/Nagbar';
import {NagbarButton} from '~/components/layout/NagbarButton';
import {NagbarContent} from '~/components/layout/NagbarContent';
import {InviteAcceptModal} from '~/components/modals/InviteAcceptModal';
import AuthenticationStore from '~/stores/AuthenticationStore';
import GuildMemberStore from '~/stores/GuildMemberStore';
import GuildStore from '~/stores/GuildStore';
import InviteStore from '~/stores/InviteStore';
import NagbarStore from '~/stores/NagbarStore';
import {isGuildInvite} from '~/types/InviteTypes';

const ASTRAL_HQ_INVITE_CODE = 'c4aCFgoh';

export const GuildMembershipCtaNagbar = observer(({isMobile}: {isMobile: boolean}) => {
	const currentUserId = AuthenticationStore.currentUserId;
	const inviteState = InviteStore.invites.get(ASTRAL_HQ_INVITE_CODE);
	const invite = inviteState?.data ?? null;

	const [isSubmitting, setIsSubmitting] = React.useState(false);

	React.useEffect(() => {
		const AstralHqGuild = GuildStore.getGuilds().find((guild) => guild.vanityURLCode === ASTRAL_HQ_INVITE_CODE);
		if (AstralHqGuild && GuildMemberStore.getMember(AstralHqGuild.id, currentUserId ?? '')) {
			NagbarStore.guildMembershipCtaDismissed = true;
		}
	}, [currentUserId]);

	if (!currentUserId) {
		return null;
	}

	if (invite && isGuildInvite(invite)) {
		const guildId = invite.guild.id;
		const isMember = Boolean(GuildMemberStore.getMember(guildId, currentUserId));
		if (isMember) {
			return null;
		}
	}

	const handleJoinGuild = async () => {
		if (isSubmitting) return;

		setIsSubmitting(true);
		try {
			await InviteActionCreators.fetchWithCoalescing(ASTRAL_HQ_INVITE_CODE);
		} finally {
			setIsSubmitting(false);
			ModalActionCreators.push(modal(() => <InviteAcceptModal code={ASTRAL_HQ_INVITE_CODE} />));
		}
	};

	const handleDismiss = () => {
		NagbarStore.guildMembershipCtaDismissed = true;
	};

	return (
		<Nagbar
			isMobile={isMobile}
			backgroundColor="var(--brand-primary)"
			textColor="var(--text-on-brand-primary)"
			onDismiss={handleDismiss}
			dismissible={true}
		>
			<NagbarContent
				isMobile={isMobile}
				message={<Trans>Join Astral HQ to chat with the team and stay up to date on the latest!</Trans>}
				actions={
					<NagbarButton isMobile={isMobile} onClick={handleJoinGuild} submitting={isSubmitting} disabled={isSubmitting}>
						<Trans>Join Astral HQ</Trans>
					</NagbarButton>
				}
			/>
		</Nagbar>
	);
});
