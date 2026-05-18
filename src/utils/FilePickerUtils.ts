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

interface PickerOptions {
	multiple?: boolean;
	accept?: string;
}

export const openFilePicker = ({multiple = false, accept}: PickerOptions = {}): Promise<Array<File>> =>
	new Promise((resolve) => {
		if (!document.body) {
			resolve([]);
			return;
		}

		const input = document.createElement('input');
		input.type = 'file';
		input.multiple = multiple;
		if (accept) input.accept = accept;
		input.tabIndex = -1;
		input.setAttribute('aria-hidden', 'true');
		input.style.position = 'fixed';
		input.style.left = '-9999px';
		input.style.bottom = '0';
		input.style.width = '1px';
		input.style.height = '1px';
		input.style.opacity = '0';
		input.style.pointerEvents = 'none';
		input.style.visibility = 'hidden';

		let settled = false;
		let cancelTimer: ReturnType<typeof setTimeout> | null = null;

		const cleanup = () => {
			input.onchange = null;
			input.oncancel = null;
			window.removeEventListener('focus', handleWindowFocus, true);
			if (cancelTimer) {
				clearTimeout(cancelTimer);
				cancelTimer = null;
			}
			input.remove();
		};

		const finish = (files: Array<File>) => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(files);
		};

		const handleWindowFocus = () => {
			if (cancelTimer) {
				clearTimeout(cancelTimer);
			}

			// Some Android WebViews never emit `cancel`, so resolve after focus returns
			// if nothing was selected.
			cancelTimer = setTimeout(() => {
				if (!settled && (input.files?.length ?? 0) === 0) {
					finish([]);
				}
			}, 350);
		};

		input.onchange = () => {
			finish(Array.from(input.files ?? []));
		};
		input.oncancel = () => {
			finish([]);
		};

		document.body.appendChild(input);
		window.addEventListener('focus', handleWindowFocus, true);
		if (document.activeElement instanceof HTMLElement) {
			document.activeElement.blur();
		}
		input.click();
	});
