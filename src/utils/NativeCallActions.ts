export interface NativeCallActionPayload {
	actionId: string;
	channelId: string;
}

declare global {
	interface Window {
		__astralNativeCallActionQueue?: Array<NativeCallActionPayload>;
		__astralHandleNativeCallAction?: (payload: NativeCallActionPayload) => void;
	}
}

const isValidPayload = (payload: NativeCallActionPayload | null | undefined): payload is NativeCallActionPayload =>
	Boolean(payload?.actionId && payload?.channelId);

export const dispatchNativeCallAction = (payload: NativeCallActionPayload): void => {
	if (!isValidPayload(payload)) {
		return;
	}

	if (typeof window.__astralHandleNativeCallAction === 'function') {
		window.__astralHandleNativeCallAction(payload);
		return;
	}

	const queue = window.__astralNativeCallActionQueue ?? [];
	queue.push(payload);
	window.__astralNativeCallActionQueue = queue;
};

export const bindNativeCallActionHandler = (handler: (payload: NativeCallActionPayload) => void): (() => void) => {
	window.__astralHandleNativeCallAction = handler;

	const queued = [...(window.__astralNativeCallActionQueue ?? [])];
	window.__astralNativeCallActionQueue = [];
	for (const payload of queued) {
		if (isValidPayload(payload)) {
			handler(payload);
		}
	}

	return () => {
		if (window.__astralHandleNativeCallAction === handler) {
			delete window.__astralHandleNativeCallAction;
		}
	};
};
