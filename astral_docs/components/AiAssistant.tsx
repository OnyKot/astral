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

'use client';

import {useCallback, useRef, useState} from 'react';

interface Message {
	role: 'user' | 'assistant';
	content: string;
}

export function AiAssistant() {
	const [open, setOpen] = useState(false);
	const [input, setInput] = useState('');
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const send = useCallback(async () => {
		const text = input.trim();
		if (!text || loading) return;

		const userMsg: Message = {role: 'user', content: text};
		setMessages((prev) => [...prev, userMsg]);
		setInput('');
		setLoading(true);

		try {
			const res = await fetch('/docs/api/ai', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({message: text, history: messages.slice(-6)}),
			});
			const data = await res.json();
			const reply = data.reply ?? data.error ?? 'No response';
			setMessages((prev) => [...prev, {role: 'assistant', content: reply}]);
		} catch {
			setMessages((prev) => [...prev, {role: 'assistant', content: 'Connection error. Try again.'}]);
		} finally {
			setLoading(false);
			setTimeout(() => scrollRef.current?.scrollTo({top: scrollRef.current.scrollHeight, behavior: 'smooth'}), 50);
		}
	}, [input, loading, messages]);

	if (!open) {
		return (
			<button
				type="button"
				onClick={() => setOpen(true)}
				style={{
					position: 'fixed',
					bottom: 20,
					right: 20,
					zIndex: 9999,
					width: 52,
					height: 52,
					borderRadius: 16,
					border: '1px solid rgba(255,255,255,0.12)',
					background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
					color: '#fff',
					cursor: 'pointer',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'center',
					boxShadow: '0 8px 32px rgba(79,70,229,0.4)',
					transition: 'transform 0.15s ease, box-shadow 0.15s ease',
				}}
				onMouseEnter={(e) => {
					(e.target as HTMLElement).style.transform = 'scale(1.08)';
				}}
				onMouseLeave={(e) => {
					(e.target as HTMLElement).style.transform = 'scale(1)';
				}}
				aria-label="Ask AI Assistant"
				title="Ask AI about Astral docs"
			>
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
					<path d="M12 2a7 7 0 0 1 7 7c0 3-2 5.5-4 7l-3 3-3-3c-2-1.5-4-4-4-7a7 7 0 0 1 7-7z" />
					<circle cx="12" cy="9" r="1.5" fill="currentColor" stroke="none" />
				</svg>
			</button>
		);
	}

	return (
		<div
			style={{
				position: 'fixed',
				bottom: 20,
				right: 20,
				zIndex: 9999,
				width: 380,
				maxWidth: 'calc(100vw - 40px)',
				height: 520,
				maxHeight: 'calc(100vh - 40px)',
				borderRadius: 20,
				border: '1px solid rgba(255,255,255,0.1)',
				background: 'linear-gradient(180deg, rgba(15,17,28,0.98) 0%, rgba(8,10,18,0.98) 100%)',
				boxShadow: '0 25px 80px rgba(0,0,0,0.6)',
				display: 'flex',
				flexDirection: 'column',
				overflow: 'hidden',
				backdropFilter: 'blur(24px)',
			}}
		>
			{/* Header */}
			<div
				style={{
					padding: '14px 16px',
					borderBottom: '1px solid rgba(255,255,255,0.08)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					background: 'rgba(255,255,255,0.03)',
				}}
			>
				<div style={{display: 'flex', alignItems: 'center', gap: 8}}>
					<div
						style={{
							width: 28,
							height: 28,
							borderRadius: 8,
							background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							fontSize: 14,
						}}
					>
						AI
					</div>
					<span style={{fontWeight: 600, fontSize: 14, color: '#e2e8f0'}}>Astral Docs Assistant</span>
				</div>
				<button
					type="button"
					onClick={() => setOpen(false)}
					style={{
						background: 'rgba(255,255,255,0.08)',
						border: 'none',
						borderRadius: 8,
						width: 28,
						height: 28,
						color: '#94a3b8',
						cursor: 'pointer',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						fontSize: 16,
					}}
					aria-label="Close"
				>
					&times;
				</button>
			</div>

			{/* Messages */}
			<div
				ref={scrollRef}
				style={{
					flex: 1,
					overflowY: 'auto',
					padding: 16,
					display: 'flex',
					flexDirection: 'column',
					gap: 12,
				}}
			>
				{messages.length === 0 && (
					<div style={{textAlign: 'center', color: '#64748b', fontSize: 13, marginTop: 40}}>
						<p style={{marginBottom: 8, fontSize: 20}}>&#x1F4DA;</p>
						<p style={{fontWeight: 500}}>Ask anything about the Astral API</p>
						<p style={{fontSize: 12, marginTop: 4, color: '#475569'}}>
							Bots, OAuth2, Gateway events, self-hosting...
						</p>
					</div>
				)}
				{messages.map((msg, i) => (
					<div
						key={i}
						style={{
							alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
							maxWidth: '85%',
							padding: '10px 14px',
							borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
							background:
								msg.role === 'user'
									? 'linear-gradient(135deg, #4f46e5, #6366f1)'
									: 'rgba(255,255,255,0.06)',
							color: msg.role === 'user' ? '#fff' : '#e2e8f0',
							fontSize: 13,
							lineHeight: 1.5,
							whiteSpace: 'pre-wrap',
							wordBreak: 'break-word',
							border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.06)' : 'none',
						}}
					>
						{msg.content}
					</div>
				))}
				{loading && (
					<div
						style={{
							alignSelf: 'flex-start',
							padding: '10px 14px',
							borderRadius: '16px 16px 16px 4px',
							background: 'rgba(255,255,255,0.06)',
							color: '#94a3b8',
							fontSize: 13,
							border: '1px solid rgba(255,255,255,0.06)',
						}}
					>
						Thinking...
					</div>
				)}
			</div>

			{/* Input */}
			<div
				style={{
					padding: '12px 14px',
					borderTop: '1px solid rgba(255,255,255,0.08)',
					display: 'flex',
					gap: 8,
				}}
			>
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
					placeholder="Ask a question..."
					style={{
						flex: 1,
						background: 'rgba(255,255,255,0.06)',
						border: '1px solid rgba(255,255,255,0.1)',
						borderRadius: 12,
						padding: '10px 14px',
						color: '#e2e8f0',
						fontSize: 13,
						outline: 'none',
					}}
					disabled={loading}
				/>
				<button
					type="button"
					onClick={send}
					disabled={loading || !input.trim()}
					style={{
						background: !input.trim() || loading ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
						border: 'none',
						borderRadius: 12,
						padding: '10px 16px',
						color: '#fff',
						fontWeight: 600,
						fontSize: 13,
						cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
						opacity: !input.trim() || loading ? 0.5 : 1,
						transition: 'opacity 0.15s',
					}}
				>
					Send
				</button>
			</div>
		</div>
	);
}
