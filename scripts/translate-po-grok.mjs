#!/usr/bin/env node
/**
 * Translate empty msgstr entries in lingui .po catalogs using Grok (xAI).
 *
 * Usage:
 *   GROK_API_KEY=xai-... node scripts/translate-po-grok.mjs [--locale=ru] [--concurrency=4] [--chunk=30] [--limit=0]
 *
 * Walks src/locales/{locale}/messages.po for every non-source locale (or just the one
 * passed with --locale), batches empty msgstr entries and asks Grok for a JSON
 * response keyed by msgid. Writes back in place. Non-destructive: existing
 * non-empty msgstr values are preserved.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOCALES_DIR = path.resolve(__dirname, '..', 'src', 'locales');
const SOURCE_LOCALE = 'en-US';
const GROK_API_URL = process.env.GROK_API_URL || 'https://api.x.ai/v1/chat/completions';
const GROK_MODEL = process.env.GROK_MODEL || 'grok-3-mini-fast';
const API_KEY = process.env.GROK_API_KEY;

if (!API_KEY) {
	console.error('ERROR: GROK_API_KEY env var is required.');
	process.exit(1);
}

const LANGUAGE_NAMES = {
	ar: 'Arabic',
	bg: 'Bulgarian',
	cs: 'Czech',
	da: 'Danish',
	de: 'German',
	el: 'Greek',
	'en-GB': 'British English',
	'es-419': 'Latin American Spanish',
	'es-ES': 'European Spanish',
	fi: 'Finnish',
	fr: 'French',
	he: 'Hebrew',
	hi: 'Hindi',
	hr: 'Croatian',
	hu: 'Hungarian',
	id: 'Indonesian',
	it: 'Italian',
	ja: 'Japanese',
	ko: 'Korean',
	lt: 'Lithuanian',
	nl: 'Dutch',
	no: 'Norwegian',
	pl: 'Polish',
	'pt-BR': 'Brazilian Portuguese',
	ro: 'Romanian',
	ru: 'Russian',
	'sv-SE': 'Swedish',
	th: 'Thai',
	tr: 'Turkish',
	uk: 'Ukrainian',
	vi: 'Vietnamese',
	'zh-CN': 'Simplified Chinese',
	'zh-TW': 'Traditional Chinese',
};

const args = Object.fromEntries(
	process.argv
		.slice(2)
		.filter((arg) => arg.startsWith('--'))
		.map((arg) => {
			const [k, v] = arg.slice(2).split('=');
			return [k, v ?? 'true'];
		}),
);

const onlyLocale = args.locale || null;
const concurrency = Number(args.concurrency ?? 3);
const chunkSize = Number(args.chunk ?? 30);
const limit = Number(args.limit ?? 0);

const decodeMsg = (raw) => {
	return raw.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
};

const encodeMsg = (raw) => {
	return raw.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
};

const parsePo = (text) => {
	const lines = text.split(/\r?\n/);
	const entries = [];
	let i = 0;

	while (i < lines.length) {
		const commentBlock = [];
		while (i < lines.length && (lines[i].startsWith('#') || lines[i] === '')) {
			commentBlock.push(lines[i]);
			i += 1;
		}

		if (i >= lines.length) {
			entries.push({kind: 'tail', lines: commentBlock});
			break;
		}

		const msgidMatches = [];
		const msgstrMatches = [];
		let ctxBlock = null;

		if (lines[i]?.startsWith('msgctxt ')) {
			ctxBlock = lines[i];
			i += 1;
			while (i < lines.length && lines[i].startsWith('"')) {
				ctxBlock += '\n' + lines[i];
				i += 1;
			}
		}

		if (!lines[i]?.startsWith('msgid ')) {
			entries.push({kind: 'raw', lines: commentBlock});
			continue;
		}

		const msgidLineStart = i;
		let msgidLit = lines[i].slice('msgid '.length);
		i += 1;
		while (i < lines.length && lines[i].startsWith('"')) {
			msgidLit += '\n' + lines[i];
			i += 1;
		}
		msgidMatches.push(msgidLit);

		if (!lines[i]?.startsWith('msgstr ')) {
			entries.push({kind: 'raw', lines: [...commentBlock, ...lines.slice(msgidLineStart, i)]});
			continue;
		}

		const msgstrLineStart = i;
		let msgstrLit = lines[i].slice('msgstr '.length);
		i += 1;
		while (i < lines.length && lines[i].startsWith('"')) {
			msgstrLit += '\n' + lines[i];
			i += 1;
		}
		msgstrMatches.push(msgstrLit);

		entries.push({
			kind: 'entry',
			comments: commentBlock,
			ctx: ctxBlock,
			msgidRaw: msgidLit,
			msgstrRaw: msgstrLit,
			msgidLine: msgidLineStart,
		});
	}

	return entries;
};

const extractText = (literalBlock) => {
	// Literal block: starts with "..." possibly followed by "..." on new lines.
	const parts = literalBlock.split('\n').map((line) => line.trim());
	return parts
		.map((part) => {
			const match = part.match(/^"([\s\S]*)"$/);
			return match ? decodeMsg(match[1]) : '';
		})
		.join('');
};

const buildLiteralBlock = (text) => {
	const encoded = encodeMsg(text);
	return `"${encoded}"`;
};

const serializePo = (entries) => {
	const out = [];
	for (const entry of entries) {
		if (entry.kind === 'tail' || entry.kind === 'raw') {
			out.push(...entry.lines);
			continue;
		}
		out.push(...entry.comments);
		if (entry.ctx) {
			out.push(entry.ctx);
		}
		out.push(`msgid ${entry.msgidRaw}`.replace(/\n/g, '\n'));
		out.push(`msgstr ${entry.msgstrRaw}`.replace(/\n/g, '\n'));
	}
	return out.join('\n');
};

const buildPrompt = (locale, languageName, batch) => {
	const system = `You are a professional UI localizer. Translate English source strings into ${languageName} (${locale}) for an instant-messaging app called Astral. Preserve placeholders like {name}, {count}, %s, <0>, </0>, {0}, etc. verbatim. Keep punctuation, capitalization style, and trailing ellipses. Return valid JSON only, no prose.`;

	const items = batch.map((it, idx) => ({id: idx, msgid: it.msgid}));

	const user = `Translate each "msgid" into natural ${languageName}. Respond with a JSON object: {"translations":[{"id":<number>,"msgstr":"<translation>"}]}. One entry per input id. Keep any placeholder tokens unchanged.\n\nInput:\n${JSON.stringify(items, null, 2)}`;

	return {system, user};
};

const translateBatch = async (locale, languageName, batch) => {
	const {system, user} = buildPrompt(locale, languageName, batch);

	const body = {
		model: GROK_MODEL,
		messages: [
			{role: 'system', content: system},
			{role: 'user', content: user},
		],
		temperature: 0.2,
		top_p: 0.9,
		max_tokens: 4096,
		stream: false,
		response_format: {type: 'json_object'},
	};

	const res = await fetch(GROK_API_URL, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${API_KEY}`,
		},
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
	}

	const data = await res.json();
	const content = data.choices?.[0]?.message?.content ?? '';
	if (!content) {
		throw new Error('Empty response from Grok');
	}

	let parsed;
	try {
		parsed = JSON.parse(content);
	} catch (err) {
		throw new Error(`Failed to parse Grok JSON: ${err.message}; content head: ${content.slice(0, 200)}`);
	}

	const translations = parsed.translations;
	if (!Array.isArray(translations)) {
		throw new Error(`No translations array in response; keys: ${Object.keys(parsed).join(',')}`);
	}

	const byId = new Map();
	for (const item of translations) {
		if (typeof item.id === 'number' && typeof item.msgstr === 'string') {
			byId.set(item.id, item.msgstr);
		}
	}

	return batch.map((it, idx) => ({
		msgid: it.msgid,
		msgstr: byId.get(idx) ?? '',
	}));
};

const chunk = (arr, size) => {
	const out = [];
	for (let i = 0; i < arr.length; i += size) {
		out.push(arr.slice(i, i + size));
	}
	return out;
};

const processLocale = async (locale) => {
	const poPath = path.join(LOCALES_DIR, locale, 'messages.po');
	const text = await fs.readFile(poPath, 'utf8');
	const entries = parsePo(text);

	const pending = [];
	for (const entry of entries) {
		if (entry.kind !== 'entry') continue;
		const msgid = extractText(entry.msgidRaw);
		const msgstr = extractText(entry.msgstrRaw);
		if (!msgid) continue; // header
		if (!msgstr) {
			pending.push({entry, msgid});
		}
	}

	if (pending.length === 0) {
		console.log(`[${locale}] already complete`);
		return;
	}

	const workload = limit > 0 ? pending.slice(0, limit) : pending;
	const batches = chunk(workload, chunkSize);
	const languageName = LANGUAGE_NAMES[locale] ?? locale;

	console.log(`[${locale}] ${workload.length} pending · ${batches.length} batches · ${languageName}`);

	let done = 0;
	const startedAt = Date.now();

	const runBatch = async (batch, batchIdx) => {
		let attempt = 0;
		while (attempt < 4) {
			try {
				const results = await translateBatch(locale, languageName, batch.map((p) => ({msgid: p.msgid})));
				for (let i = 0; i < batch.length; i += 1) {
					const translation = results[i]?.msgstr;
					if (translation && translation.trim()) {
						batch[i].entry.msgstrRaw = buildLiteralBlock(translation);
					}
				}
				done += batch.length;
				const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
				console.log(`[${locale}] batch ${batchIdx + 1}/${batches.length} · ${done}/${workload.length} · ${elapsed}s`);
				return;
			} catch (err) {
				attempt += 1;
				const wait = Math.min(2000 * attempt, 15000);
				console.warn(`[${locale}] batch ${batchIdx + 1} attempt ${attempt} failed: ${err.message}; retrying in ${wait}ms`);
				await new Promise((r) => setTimeout(r, wait));
			}
		}
		console.error(`[${locale}] batch ${batchIdx + 1} gave up after 4 attempts`);
	};

	// Limited concurrency
	const queue = batches.map((b, i) => () => runBatch(b, i));
	const workers = Array.from({length: Math.min(concurrency, queue.length)}, async () => {
		while (queue.length) {
			const job = queue.shift();
			if (!job) return;
			await job();
		}
	});
	await Promise.all(workers);

	const serialized = serializePo(entries);
	await fs.writeFile(poPath, serialized, 'utf8');
	console.log(`[${locale}] wrote ${poPath}`);
};

const main = async () => {
	const dirs = await fs.readdir(LOCALES_DIR, {withFileTypes: true});
	const locales = dirs
		.filter((d) => d.isDirectory() && d.name !== SOURCE_LOCALE)
		.map((d) => d.name);

	const target = onlyLocale ? locales.filter((l) => l === onlyLocale) : locales;

	if (target.length === 0) {
		console.error('No locales to process (check --locale=)');
		process.exit(1);
	}

	for (const locale of target) {
		try {
			await processLocale(locale);
		} catch (err) {
			console.error(`[${locale}] FAILED:`, err.message);
		}
	}

	console.log('All locales processed.');
};

main().catch((err) => {
	console.error('Fatal:', err);
	process.exit(1);
});
