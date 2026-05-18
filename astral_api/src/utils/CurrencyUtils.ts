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

export type Currency = 'USD' | 'EUR' | 'RUB';

const EEA_COUNTRIES = [
	'AT',
	'BE',
	'BG',
	'HR',
	'CY',
	'CZ',
	'DK',
	'EE',
	'FI',
	'FR',
	'DE',
	'GR',
	'HU',
	'IE',
	'IT',
	'LV',
	'LT',
	'LU',
	'MT',
	'NL',
	'PL',
	'PT',
	'RO',
	'SK',
	'SI',
	'ES',
	'SE',
	'IS',
	'LI',
	'NO',
];

function isEEACountry(countryCode: string): boolean {
	const upperCode = countryCode.toUpperCase();
	return EEA_COUNTRIES.includes(upperCode);
}

function isRubleCountry(countryCode: string): boolean {
	return countryCode.toUpperCase() === 'RU';
}

export function getCurrency(countryCode: string | null | undefined): Currency {
	if (!countryCode) {
		return 'USD';
	}
	if (isRubleCountry(countryCode)) {
		return 'RUB';
	}
	return isEEACountry(countryCode) ? 'EUR' : 'USD';
}
