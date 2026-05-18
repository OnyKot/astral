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

import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const execFileAsync = promisify(execFile);

const POWERSHELL_SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
[void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]
[void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType=WindowsRuntime]

$asTaskGeneric = [System.WindowsRuntimeSystemExtensions].GetMethods() |
    Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1 } |
    Select-Object -First 1

$managerOp = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()
$managerTask = $asTaskGeneric.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]).Invoke($null, @($managerOp))
$manager = $managerTask.GetAwaiter().GetResult()
$session = $manager.GetCurrentSession()

if ($null -eq $session) {
    Write-Output ''
    exit 0
}

$infoOp = $session.TryGetMediaPropertiesAsync()
$infoTask = $asTaskGeneric.MakeGenericMethod([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]).Invoke($null, @($infoOp))
$info = $infoTask.GetAwaiter().GetResult()
$playback = $session.GetPlaybackInfo()
$timeline = $session.GetTimelineProperties()
$artworkDataUrl = $null

if ($null -ne $info.Thumbnail) {
    try {
        $thumbOp = $info.Thumbnail.OpenReadAsync()
        $thumbTask = $asTaskGeneric.MakeGenericMethod([Windows.Storage.Streams.IRandomAccessStreamWithContentType]).Invoke($null, @($thumbOp))
        $thumbStream = $thumbTask.GetAwaiter().GetResult()

        if ($null -ne $thumbStream -and $thumbStream.Size -gt 0) {
            $thumbSize = [uint32]$thumbStream.Size
            $thumbReader = [Windows.Storage.Streams.DataReader]::new($thumbStream.GetInputStreamAt(0))
            $loadThumbOp = $thumbReader.LoadAsync($thumbSize)
            $loadThumbTask = $asTaskGeneric.MakeGenericMethod([uint32]).Invoke($null, @($loadThumbOp))
            [void]$loadThumbTask.GetAwaiter().GetResult()

            $thumbBytes = New-Object byte[] $thumbSize
            $thumbReader.ReadBytes($thumbBytes)
            $thumbReader.Dispose()

            $contentType = $thumbStream.ContentType
            if ([string]::IsNullOrWhiteSpace($contentType)) {
                $contentType = 'image/jpeg'
            }

            $artworkDataUrl = 'data:' + $contentType + ';base64,' + [Convert]::ToBase64String($thumbBytes)
            $thumbStream.Dispose()
        }
    } catch {
        $artworkDataUrl = $null
    }
}

$payload = [pscustomobject]@{
    app = $session.SourceAppUserModelId
    title = $info.Title
    artist = $info.Artist
    album = $info.AlbumTitle
    artworkDataUrl = $artworkDataUrl
    status = $playback.PlaybackStatus.ToString()
    positionMs = [int64]$timeline.Position.TotalMilliseconds
    durationMs = [int64]$timeline.EndTime.TotalMilliseconds
} | ConvertTo-Json -Compress

[Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($payload))
`;

export interface WindowsNowPlayingSnapshot {
	sourceAppId: string | null;
	sourceLabel: string | null;
	title: string;
	artists: Array<string>;
	album: string | null;
	artworkUrl: string | null;
	isPlaying: boolean;
	progressMs: number | null;
	durationMs: number | null;
}

type RawNowPlayingSnapshot = {
	app?: string | null;
	title?: string | null;
	artist?: string | null;
	album?: string | null;
	artworkDataUrl?: string | null;
	status?: string | null;
	positionMs?: number | null;
	durationMs?: number | null;
};

type ITunesSearchTrack = {
	artworkUrl100?: string;
	artworkUrl60?: string;
};

type ITunesSearchResponse = {
	results?: Array<ITunesSearchTrack>;
};

const itunesArtworkCache = new Map<string, string | null>();

const upscaleItunesArtwork = (url: string): string => {
	return url.replace(/\/\d+x\d+bb(?=\.)/u, '/600x600bb');
};

const buildArtworkLookupKey = (title: string, artists: Array<string>): string => {
	return `${title.toLowerCase()}|${artists.join(',').toLowerCase()}`;
};

const fetchItunesArtwork = async (title: string, artists: Array<string>): Promise<string | null> => {
	const terms = [`${title} ${artists[0] ?? ''}`.trim(), title.trim()].filter((term) => term.length > 0);

	for (const term of terms) {
		const url = new URL('https://itunes.apple.com/search');
		url.searchParams.set('media', 'music');
		url.searchParams.set('entity', 'song');
		url.searchParams.set('limit', '1');
		url.searchParams.set('term', term);

		try {
			const response = await fetch(url.toString());
			if (!response.ok) {
				continue;
			}

			const payload = (await response.json()) as ITunesSearchResponse;
			const first = payload.results?.[0];
			const artwork = first?.artworkUrl100 ?? first?.artworkUrl60 ?? null;
			if (artwork) {
				return upscaleItunesArtwork(artwork);
			}
		} catch {
			continue;
		}
	}

	return null;
};

const normalizeSourceLabel = (appId: string | null | undefined): string | null => {
	const raw = appId?.trim();
	if (!raw) {
		return null;
	}

	const withoutPath = raw.split(/[\\/]/u).pop() ?? raw;
	const withoutExtension = withoutPath.replace(/\.exe$/iu, '');
	const label = withoutExtension.replace(/[_-]+/gu, ' ').trim();
	return label.length > 0 ? label : raw;
};

const splitArtists = (value: string | null | undefined): Array<string> => {
	return (value ?? '')
		.split(/[;,]/u)
		.map((artist) => artist.trim())
		.filter((artist) => artist.length > 0);
};

export async function getWindowsNowPlayingSnapshot(): Promise<WindowsNowPlayingSnapshot | null> {
	if (process.platform !== 'win32') {
		return null;
	}

	const {stdout} = await execFileAsync(
		'powershell.exe',
		[
			'-NoProfile',
			'-NonInteractive',
			'-ExecutionPolicy',
			'Bypass',
			'-Command',
			POWERSHELL_SCRIPT,
		],
		{windowsHide: true, timeout: 10_000, maxBuffer: 1024 * 1024},
	);

	const trimmed = stdout.trim();
	if (!trimmed) {
		return null;
	}

	const json = Buffer.from(trimmed, 'base64').toString('utf8');
	const raw = JSON.parse(json) as RawNowPlayingSnapshot;
	const title = raw.title?.trim() ?? '';
	const artists = splitArtists(raw.artist);

	if (!title || artists.length === 0) {
		return null;
	}

	let artworkUrl = raw.artworkDataUrl?.trim() || null;
	if (!artworkUrl) {
		const key = buildArtworkLookupKey(title, artists);
		if (itunesArtworkCache.has(key)) {
			artworkUrl = itunesArtworkCache.get(key) ?? null;
		} else {
			artworkUrl = await fetchItunesArtwork(title, artists);
			itunesArtworkCache.set(key, artworkUrl ?? null);
		}
	}

	return {
		sourceAppId: raw.app?.trim() || null,
		sourceLabel: normalizeSourceLabel(raw.app),
		title,
		artists,
		album: raw.album?.trim() || null,
		artworkUrl,
		isPlaying: (raw.status ?? '').toLowerCase() === 'playing',
		progressMs: Number.isFinite(raw.positionMs) ? raw.positionMs ?? null : null,
		durationMs: Number.isFinite(raw.durationMs) ? raw.durationMs ?? null : null,
	};
}
