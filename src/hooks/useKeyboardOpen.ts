import React from 'react';

const KEYBOARD_INSET_THRESHOLD_PX = 120;

/*
 * Reports whether the virtual keyboard is currently covering a meaningful
 * part of the viewport. Uses visualViewport to detect the inset between
 * window.innerHeight and the visible region, which is how mobile Chrome
 * and iOS Safari expose the keyboard height.
 *
 * Returns false on desktop/when the API is missing — callers can use
 * that to decide whether to hide nav chrome to make room for the
 * on-screen keyboard.
 */
export function useKeyboardOpen(): boolean {
	const [isOpen, setIsOpen] = React.useState(false);

	React.useEffect(() => {
		const viewport = window.visualViewport;
		if (!viewport) return;

		const update = () => {
			const visibleBottom = viewport.height + viewport.offsetTop;
			const inset = Math.max(0, Math.round(window.innerHeight - visibleBottom));
			setIsOpen(inset > KEYBOARD_INSET_THRESHOLD_PX);
		};

		update();
		viewport.addEventListener('resize', update);
		viewport.addEventListener('scroll', update);
		window.addEventListener('orientationchange', update);

		return () => {
			viewport.removeEventListener('resize', update);
			viewport.removeEventListener('scroll', update);
			window.removeEventListener('orientationchange', update);
		};
	}, []);

	return isOpen;
}
