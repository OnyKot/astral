const REFERRAL_STORAGE_KEY = 'astral_referral_code';

function normalizeReferralCode(value: string | null | undefined): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (!/^\d{3,}$/.test(trimmed)) return null;
	return trimmed;
}

export function captureReferralCodeFromSearchParams(searchParams: URLSearchParams): string | null {
	const referralCode = normalizeReferralCode(searchParams.get('ref'));
	if (!referralCode || typeof window === 'undefined') return null;
	window.localStorage.setItem(REFERRAL_STORAGE_KEY, referralCode);
	return referralCode;
}

export function getStoredReferralCode(): string | null {
	if (typeof window === 'undefined') return null;
	return normalizeReferralCode(window.localStorage.getItem(REFERRAL_STORAGE_KEY));
}
