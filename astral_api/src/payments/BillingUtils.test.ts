import {describe, expect, it, vi} from 'vitest';

vi.mock('~/Config', () => ({
	Config: {
		stripe: {enabled: false},
		tbank: {enabled: false},
		cloudpayments: {enabled: false},
		intellectmoney: {enabled: false},
		wata: {enabled: false},
	},
}));

import {Config} from '~/Config';
import {isBillingOnline} from './BillingUtils';

describe('isBillingOnline', () => {
	it('is false when all providers are disabled', () => {
		expect(isBillingOnline()).toBe(false);
	});

	it('is true when any provider is enabled', () => {
		(Config as any).wata.enabled = true;
		expect(isBillingOnline()).toBe(true);
		(Config as any).wata.enabled = false;
	});
});
