import '~/instrument';

import {Redis} from 'ioredis';
import {createUserID, type UserID} from '~/BrandedTypes';
import {UserAuthenticatorTypes} from '~/Constants';
import type {EmailService} from '~/infrastructure/EmailService';
import type {UserCacheService} from '~/infrastructure/UserCacheService';
import type {User} from '~/Models';
import type {UserRepository} from '~/user/UserRepository';

type MigrationMode = 'notify' | 'reset';

interface CliOptions {
	mode: MigrationMode;
	apply: boolean;
	limit: number | null;
	batchSize: number;
	userId: UserID | null;
}

interface Summary {
	scanned: number;
	candidates: number;
	emailsSent: number;
	passkeysRemoved: number;
	cacheInvalidations: number;
	skippedNoEmail: number;
	staleAuthenticatorFlags: number;
	failures: number;
}

function printUsage(): void {
	console.log(`Usage:
  pnpm passkeys:migrate --mode=notify [--limit=100] [--batch-size=200] [--apply]
  pnpm passkeys:migrate --mode=reset [--limit=100] [--batch-size=200] [--apply]
  pnpm passkeys:migrate --mode=notify --user-id=123 [--apply]

Defaults:
  - dry-run unless --apply is provided
  - scans only users marked with WebAuthn MFA
  - reset mode removes passkeys and emails the user if an email exists`);
}

function parsePositiveInt(raw: string, flagName: string): number {
	const value = Number.parseInt(raw, 10);
	if (!Number.isFinite(value) || value <= 0) {
		throw new Error(`Invalid ${flagName}: ${raw}`);
	}
	return value;
}

function parseOptions(argv: Array<string>): CliOptions {
	let mode: MigrationMode | null = null;
	let apply = false;
	let limit: number | null = null;
	let batchSize = 200;
	let userId: UserID | null = null;

	for (const arg of argv) {
		if (arg === '--apply') {
			apply = true;
			continue;
		}

		if (arg === '--help' || arg === '-h') {
			printUsage();
			process.exit(0);
		}

		if (arg.startsWith('--mode=')) {
			const value = arg.slice('--mode='.length);
			if (value !== 'notify' && value !== 'reset') {
				throw new Error(`Invalid --mode value: ${value}`);
			}
			mode = value;
			continue;
		}

		if (arg.startsWith('--limit=')) {
			limit = parsePositiveInt(arg.slice('--limit='.length), '--limit');
			continue;
		}

		if (arg.startsWith('--batch-size=')) {
			batchSize = parsePositiveInt(arg.slice('--batch-size='.length), '--batch-size');
			continue;
		}

		if (arg.startsWith('--user-id=')) {
			userId = createUserID(BigInt(arg.slice('--user-id='.length)));
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	if (!mode) {
		throw new Error('Missing required --mode=notify|reset');
	}

	return {mode, apply, limit, batchSize, userId};
}

function createSummary(): Summary {
	return {
		scanned: 0,
		candidates: 0,
		emailsSent: 0,
		passkeysRemoved: 0,
		cacheInvalidations: 0,
		skippedNoEmail: 0,
		staleAuthenticatorFlags: 0,
		failures: 0,
	};
}

function shouldStop(summary: Summary, options: CliOptions): boolean {
	return options.limit !== null && summary.candidates >= options.limit;
}

function formatUserLabel(user: Pick<User, 'id' | 'username' | 'email'>): string {
	return `${user.username} (${user.id.toString()})${user.email ? ` <${user.email}>` : ''}`;
}

async function processCandidate(params: {
	user: User;
	options: CliOptions;
	userRepository: UserRepository;
	emailService: EmailService;
	userCacheService: UserCacheService;
	summary: Summary;
}): Promise<void> {
	const {user, options, userRepository, emailService, userCacheService, summary} = params;
	const hasWebAuthnFlag = user.authenticatorTypes.has(UserAuthenticatorTypes.WEBAUTHN);
	const credentials = await userRepository.listWebAuthnCredentials(user.id);
	const credentialCount = credentials.length;
	const hasPasskeys = credentialCount > 0;
	const hasStaleWebAuthnFlag = hasWebAuthnFlag && !hasPasskeys;

	if (!hasPasskeys && !hasStaleWebAuthnFlag) {
		return;
	}

	summary.candidates += 1;
	if (hasStaleWebAuthnFlag) {
		summary.staleAuthenticatorFlags += 1;
	}

	const label = formatUserLabel(user);

	if (!options.apply) {
		if (options.mode === 'notify') {
			console.log(
				`[dry-run] would send migration email to ${label}; passkeys=${credentialCount}, stale_flag=${hasStaleWebAuthnFlag}`,
			);
		} else {
			console.log(
				`[dry-run] would reset passkeys for ${label}; passkeys=${credentialCount}, stale_flag=${hasStaleWebAuthnFlag}, email=${user.email ?? 'none'}`,
			);
		}
		if (!user.email) {
			summary.skippedNoEmail += 1;
		}
		return;
	}

	if (options.mode === 'notify') {
		if (!hasPasskeys) {
			console.log(`[info] skipping migration email for stale WebAuthn flag without passkeys user_id=${user.id.toString()}`);
			return;
		}

		if (!user.email) {
			summary.skippedNoEmail += 1;
			console.warn(`[warn] skipping passkey migration email: no email user_id=${user.id.toString()}`);
			return;
		}

		const sent = await emailService.sendPasskeyMigrationNotice(user.email, user.username, user.locale);
		if (!sent) {
			summary.failures += 1;
			console.error(`[error] failed to send passkey migration email user_id=${user.id.toString()} email=${user.email}`);
			return;
		}

		summary.emailsSent += 1;
		console.log(`[ok] sent passkey migration email user_id=${user.id.toString()} email=${user.email}`);
		return;
	}

	if (hasPasskeys) {
		await userRepository.deleteAllWebAuthnCredentials(user.id);
		summary.passkeysRemoved += credentialCount;
	}

	if (hasWebAuthnFlag) {
		const authenticatorTypes = new Set(user.authenticatorTypes);
		authenticatorTypes.delete(UserAuthenticatorTypes.WEBAUTHN);
		await userRepository.patchUpsert(user.id, {
			authenticator_types: authenticatorTypes.size > 0 ? authenticatorTypes : null,
		});
	}

	await userCacheService.invalidateUserCache(user.id);
	summary.cacheInvalidations += 1;

	if (!user.email) {
		summary.skippedNoEmail += 1;
		console.warn(`[warn] reset passkeys but user has no email user_id=${user.id.toString()}`);
		return;
	}

	const sent = await emailService.sendPasskeyResetNotice(user.email, user.username, user.locale);
	if (!sent) {
		summary.failures += 1;
		console.error(`[error] reset passkeys but failed to send follow-up email user_id=${user.id.toString()} email=${user.email}`);
		return;
	}

	summary.emailsSent += 1;
	console.log(`[ok] reset passkeys and sent follow-up email user_id=${user.id.toString()} email=${user.email}`);
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const summary = createSummary();
	if (process.argv.includes('--help') || process.argv.includes('-h')) {
		printUsage();
		return;
	}
	const [{Config}, {EmailService}, {RedisCacheService}, {UserCacheService}] = await Promise.all([
		import('~/Config'),
		import('~/infrastructure/EmailService'),
		import('~/infrastructure/RedisCacheService'),
		import('~/infrastructure/UserCacheService'),
	]);
	const {UserRepository} = await import('~/user/UserRepository');

	console.log(
		`${options.apply ? 'applying' : 'dry-run'} mode=${options.mode} batch_size=${options.batchSize}${options.limit ? ` limit=${options.limit}` : ''}${options.userId ? ` user_id=${options.userId.toString()}` : ''}`,
	);

	const redis = new Redis(Config.redis.url);
	const userRepository = new UserRepository();
	const emailService = new EmailService(userRepository);
	const userCacheService = new UserCacheService(new RedisCacheService(redis), userRepository);

	try {
		if (options.userId) {
			const user = await userRepository.findUnique(options.userId);
			if (!user) {
				throw new Error(`Unknown user: ${options.userId.toString()}`);
			}

			summary.scanned = 1;
			await processCandidate({user, options, userRepository, emailService, userCacheService, summary});
		} else {
			let lastUserId: UserID | undefined;

			while (true) {
				const batch = await userRepository.listAllUsersPaginated(options.batchSize, lastUserId);
				if (batch.length === 0) {
					break;
				}

				for (const user of batch) {
					summary.scanned += 1;

					if (!user.authenticatorTypes.has(UserAuthenticatorTypes.WEBAUTHN)) {
						continue;
					}

					await processCandidate({user, options, userRepository, emailService, userCacheService, summary});

					if (shouldStop(summary, options)) {
						break;
					}
				}

				if (shouldStop(summary, options)) {
					break;
				}

				lastUserId = batch.at(-1)?.id;
				if (!lastUserId) {
					break;
				}
			}
		}
	} finally {
		await redis.quit();
	}

	console.log('summary');
	console.log(`  scanned=${summary.scanned}`);
	console.log(`  candidates=${summary.candidates}`);
	console.log(`  emails_sent=${summary.emailsSent}`);
	console.log(`  passkeys_removed=${summary.passkeysRemoved}`);
	console.log(`  cache_invalidations=${summary.cacheInvalidations}`);
	console.log(`  skipped_no_email=${summary.skippedNoEmail}`);
	console.log(`  stale_authenticator_flags=${summary.staleAuthenticatorFlags}`);
	console.log(`  failures=${summary.failures}`);

	if (summary.failures > 0) {
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(error);
	printUsage();
	process.exitCode = 1;
});
