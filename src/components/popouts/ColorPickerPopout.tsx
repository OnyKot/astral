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
import {ColorArea, ColorPicker, ColorSlider, ColorThumb, parseColor, SliderTrack} from 'react-aria-components';
import FocusRing from '~/components/uikit/FocusRing/FocusRing';
import styles from './ColorPickerPopout.module.css';

export const ColorPickerPopout = observer(
	({
		color,
		onChange,
		onReset,
	}: {
		popoutKey?: string | number;
		color: string;
		onChange: (color: string) => void;
		onReset: () => void;
	}) => {
		const hasCustomColor = color !== null && color !== '#4641D9';

		const parsedColorFromProp = React.useMemo(() => {
			try {
				return parseColor(color).toFormat('hsb');
			} catch {
				return parseColor('#4641D9').toFormat('hsb');
			}
		}, [color]);
		const [liveColor, setLiveColor] = React.useState(parsedColorFromProp);
		const pendingColorRef = React.useRef<string | null>(null);
		const parentChangeFrameRef = React.useRef<number | null>(null);

		React.useEffect(() => {
			setLiveColor(parsedColorFromProp);
		}, [parsedColorFromProp]);

		const flushParentColorChange = React.useCallback(() => {
			parentChangeFrameRef.current = null;
			const pendingColor = pendingColorRef.current;
			pendingColorRef.current = null;
			if (pendingColor) {
				onChange(pendingColor);
			}
		}, [onChange]);

		React.useEffect(() => {
			return () => {
				if (parentChangeFrameRef.current !== null) {
					window.cancelAnimationFrame(parentChangeFrameRef.current);
					parentChangeFrameRef.current = null;
				}

				const pendingColor = pendingColorRef.current;
				pendingColorRef.current = null;
				if (pendingColor) {
					onChange(pendingColor);
				}
			};
		}, [onChange]);

		const handleColorChange = React.useCallback(
			(newColor: ReturnType<typeof parseColor>) => {
				const nextColor = newColor.toFormat('hsb');
				setLiveColor(nextColor);
				pendingColorRef.current = nextColor.toString('hex');
				if (parentChangeFrameRef.current === null) {
					parentChangeFrameRef.current = window.requestAnimationFrame(flushParentColorChange);
				}
			},
			[flushParentColorChange],
		);

		return (
			<div className={styles.container}>
				<ColorPicker value={liveColor} onChange={handleColorChange}>
					<div className={hasCustomColor ? styles.pickerContainerWithMargin : styles.pickerContainer}>
						<div className={styles.pickerWrapper}>
							<ColorArea colorSpace="hsb" xChannel="saturation" yChannel="brightness" className={styles.colorArea}>
								<ColorThumb className={styles.colorThumb} />
							</ColorArea>
							<ColorSlider channel="hue" className={styles.colorSlider}>
								<SliderTrack className={styles.sliderTrack}>
									<ColorThumb className={styles.colorThumb} />
								</SliderTrack>
							</ColorSlider>
						</div>
					</div>
				</ColorPicker>
				<FocusRing offset={-2}>
					<button type="button" className={styles.resetButton} onClick={onReset} disabled={!hasCustomColor}>
						<span className={styles.resetButtonText}>
							<Trans>Reset</Trans>
						</span>
					</button>
				</FocusRing>
			</div>
		);
	},
);
