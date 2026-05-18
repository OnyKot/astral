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

const fs = require('node:fs');

/** @type {import('electron-builder').Configuration} */
const config = (() => {
	const channel = process.env.BUILD_CHANNEL === 'canary' ? 'canary' : 'stable';
	const isCanary = channel === 'canary';
	const publicWebOrigin = (
		process.env.ASTRAL_PUBLIC_WEB_ORIGIN ??
		process.env.ASTRAL_ELECTRON_STABLE_APP_URL ??
		'https://astraof.com'
	).replace(/\/+$/, '');

	const appId = isCanary ? 'app.astral.canary' : 'app.astral';
	const productName = isCanary ? 'Astral Canary' : 'Astral';
	const iconsDir = isCanary ? 'electron-build-resources/icons-canary' : 'electron-build-resources/icons-stable';

	const macEntitlements = isCanary
		? 'electron-build-resources/entitlements.mac.canary.plist'
		: 'electron-build-resources/entitlements.mac.stable.plist';

	const macProfile = isCanary
		? 'electron-build-resources/profiles/Astral_Canary.provisionprofile'
		: 'electron-build-resources/profiles/Astral.provisionprofile';
	const resolvedMacProfile = fs.existsSync(macProfile) ? macProfile : undefined;

	const winIconUrl = isCanary
		? `${publicWebOrigin}/web/icons/desktop/canary/icon.ico`
		: `${publicWebOrigin}/web/icons/desktop/stable/icon.ico`;

	const linuxExecutableName = isCanary ? 'Astralcanary' : 'Astral';
	const linuxSynopsis = productName;
	const linuxDescription = productName;

	return {
		appId,
		productName,
		copyright: 'Copyright (C) 2026 Astral Contributors',

		artifactName: `Astral-${channel}-\${version}-\${arch}.\${ext}`,

		directories: {
			output: 'dist-electron',
			buildResources: 'electron-build-resources',
		},

		files: [
			'src-electron/dist/**/*',
			'!**/*.map',
			'!**/*.md',
			'!**/README*',
			'!**/readme*',
			'!**/CHANGELOG*',
			'!**/LICENSE*',
			'!**/.github/**',
			'!**/docs/**',
			'!**/doc/**',
			'!**/example/**',
			'!**/examples/**',
			'!**/test/**',
			'!**/tests/**',
			'!**/__tests__/**',
			'!**/*.ts',
			'!**/tsconfig*.json',
		],

		extraMetadata: {
			main: 'src-electron/dist/main/index.js',
			type: 'module',
		},

		asar: true,
		compression: 'normal',

		asarUnpack: [
			'**/*.node',
			'**/*.dll',
		],

		extraResources: [
			{from: `${iconsDir}/icon.ico`, to: 'icon.ico'},
			{from: `${iconsDir}/512x512.png`, to: '512x512.png'},
			{from: `${iconsDir}/badges`, to: 'badges'},
			{from: `${iconsDir}/_compiled/Assets.car`, to: 'Assets.car'},
		],

		mac: {
			category: 'public.app-category.social-networking',
			icon: `${iconsDir}/_compiled/AppIcon.icns`,
			hardenedRuntime: true,
			gatekeeperAssess: false,
			entitlements: macEntitlements,
			entitlementsInherit: 'electron-build-resources/entitlements.mac.inherit.plist',
			provisioningProfile: resolvedMacProfile,
			extendInfo: {
				CFBundleIconName: 'AppIcon',
				NSMicrophoneUsageDescription: 'Astral needs access to your microphone for voice chat.',
				NSCameraUsageDescription: 'Astral needs access to your camera for video chat.',
				NSInputMonitoringUsageDescription: 'Astral needs Input Monitoring access for global shortcuts and hotkeys.',
			},
			notarize: true,
			target: [
				{target: 'dmg', arch: ['x64', 'arm64']},
				{target: 'zip', arch: ['x64', 'arm64']},
			],
		},

		dmg: {
			sign: false,
			icon: `${iconsDir}/_compiled/AppIcon.icns`,
			format: 'UDZO',
			contents: [
				{x: 130, y: 220},
				{x: 410, y: 220, type: 'link', path: '/Applications'},
			],
		},

		win: {
			icon: `${iconsDir}/icon.ico`,
			target: [{target: 'nsis', arch: ['x64']}],
		},

		nsis: {
			oneClick: false,
			perMachine: false,
			allowToChangeInstallationDirectory: true,
			deleteAppDataOnUninstall: false,
		},

		squirrelWindows: {
			iconUrl: winIconUrl,
		},

		linux: {
			icon: iconsDir,
			category: 'Network',
			maintainer: 'Astral Contributors',
			synopsis: linuxSynopsis,
			description: linuxDescription,
			executableName: linuxExecutableName,
			target: ['dir', 'AppImage', 'deb', 'rpm', 'tar.gz'],
			mimeTypes: ['x-scheme-handler/Astral'],
		},

		protocols: [{name: 'Astral', schemes: ['astral', 'astral']}],
	};
})();

module.exports = config;
