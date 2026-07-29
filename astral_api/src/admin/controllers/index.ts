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

import type {HonoApp} from '~/App';
import {AiAdminController} from './AiAdminController';
import {ArchiveAdminController} from './ArchiveAdminController';
import {AssetAdminController} from './AssetAdminController';
import {AuditLogAdminController} from './AuditLogAdminController';
import {BanAdminController} from './BanAdminController';
import {BulkAdminController} from './BulkAdminController';
import {CodesAdminController} from './CodesAdminController';
import {FeatureFlagAdminController} from './FeatureFlagAdminController';
import {GatewayAdminController} from './GatewayAdminController';
import {GuildAdminController} from './GuildAdminController';
import {InstanceConfigAdminController} from './InstanceConfigAdminController';
import {MessageAdminController} from './MessageAdminController';
import {MetricsAdminController} from './MetricsAdminController';
import {OpsAdminController} from './OpsAdminController';
import {PremiumWaitlistAdminController} from './PremiumWaitlistAdminController';
import {ReportAdminController} from './ReportAdminController';
import {SearchAdminController} from './SearchAdminController';
import {SnowflakeReservationAdminController} from './SnowflakeReservationAdminController';
import {UserAdminController} from './UserAdminController';
import {VerificationAdminController} from './VerificationAdminController';
import {VoiceAdminController} from './VoiceAdminController';

export const registerAdminControllers = (app: HonoApp) => {
	UserAdminController(app);
	CodesAdminController(app);
	GuildAdminController(app);
	AssetAdminController(app);
	BanAdminController(app);
	InstanceConfigAdminController(app);
	SnowflakeReservationAdminController(app);
	MessageAdminController(app);
	MetricsAdminController(app);
	OpsAdminController(app);
	PremiumWaitlistAdminController(app);
	BulkAdminController(app);
	AuditLogAdminController(app);
	ArchiveAdminController(app);
	ReportAdminController(app);
	VoiceAdminController(app);
	GatewayAdminController(app);
	SearchAdminController(app);
	VerificationAdminController(app);
	FeatureFlagAdminController(app);
	AiAdminController(app);
};
