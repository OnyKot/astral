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

import Link from 'next/link';
import {useCallback, useRef, useState} from 'react';

interface Message {
	role: 'user' | 'assistant';
	content: string;
}

const SUGGESTIONS = [
	'How do I create a bot?',
	'What are the rate limits?',
	'How does OAuth2 work?',
	'How to register slash commands?',
	'How to connect to the Gateway?',
	'How to self-host Astral?',
];

export function AskPageClient() {
	const [input, setInput] = useState('');
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const send = useCallback(
		async (text?: string) => {
			const msg = (text ?? input).trim();
			if (!msg || loading) return;

			const userMsg: Message = {role: 'user', content: msg};
			setMessages((prev) => [...prev, userMsg]);
			setInput('');
			setLoading(true);

			try {
				const res = await fetch('/docs/api/ai', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({message: msg, history: messages.slice(-6)}),
				});
				const data = await res.json();
				const reply = data.reply ?? data.error ?? 'No response';
				setMessages((prev) => [...prev, {role: 'assistant', content: reply}]);
			} catch {
				setMessages((prev) => [...prev, {role: 'assistant', content: 'Connection error. Please try again.'}]);
			} finally {
				setLoading(false);
				setTimeout(() => scrollRef.current?.scrollTo({top: scrollRef.current.scrollHeight, behavior: 'smooth'}), 60);
			}
		},
		[input, loading, messages],
	);

	return (
		<div style={{display: 'flex', flexDirection: 'column', height: '100vh', background: '#0a0b14'}}>
			{/* Header */}
			<header
				style={{
					padding: '1rem 1.5rem',
					borderBottom: '1px solid rgba(255,255,255,0.06)',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					background: 'rgba(255,255,255,0.02)',
					flexShrink: 0,
				}}
			>
				<div style={{display: 'flex', alignItems: 'center', gap: 12}}>
					<Link
						href="/"
						style={{
							color: '#94a3b8',
							textDecoration: 'none',
							fontSize: 14,
							display: 'flex',
							alignItems: 'center',
							gap: 6,
						}}
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
							<path d="M15 18l-6-6 6-6" />
						</svg>
						Docs
					</Link>
					<span style={{color: 'rgba(255,255,255,0.15)'}}>|</span>
					<div style={{display: 'flex', alignItems: 'center', gap: 8}}>
						<div
							style={{
								width: 24,
								height: 24,
								borderRadius: 6,
								background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontSize: 10,
								fontWeight: 700,
								color: '#fff',
							}}
						>
							AI
						</div>
						<span style={{fontWeight: 600, fontSize: 15, color: '#e2e8f0'}}>Astral Docs Assistant</span>
					</div>
				</div>
				<span style={{fontSize: 12, color: '#475569'}}>Powered by Grok</span>
			</header>

			{/* Messages area */}
			<div
				ref={scrollRef}
				style={{
					flex: 1,
					overflowY: 'auto',
					padding: '1.5rem',
					display: 'flex',
					flexDirection: 'column',
					gap: 16,
					maxWidth: 768,
					width: '100%',
					margin: '0 auto',
				}}
			>
				{messages.length === 0 && (
					<div style={{textAlign: 'center', marginTop: '8vh'}}>
						<div
							style={{
								width: 56,
								height: 56,
								borderRadius: 16,
								background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								margin: '0 auto 1.25rem',
								fontSize: 22,
								fontWeight: 800,
								color: '#fff',
								boxShadow: '0 12px 40px rgba(79,70,229,0.35)',
							}}
						>
							AI
						</div>
						<h2 style={{fontSize: '1.5rem', fontWeight: 700, color: '#e2e8f0', margin: '0 0 0.5rem'}}>
							Ask anything about Astral
						</h2>
						<p style={{color: '#64748b', fontSize: 14, maxWidth: 400, margin: '0 auto 2rem'}}>
							API endpoints, bot development, OAuth2, Gateway events, slash commands, self-hosting, and more.
						</p>
						<div
							style={{
								display: 'flex',
								flexWrap: 'wrap',
								gap: 8,
								justifyContent: 'center',
								maxWidth: 500,
								margin: '0 auto',
							}}
						>
							{SUGGESTIONS.map((s) => (
								<button
									key={s}
									type="button"
									onClick={() => send(s)}
									style={{
										padding: '8px 14px',
										borderRadius: 20,
										border: '1px solid rgba(255,255,255,0.1)',
										background: 'rgba(255,255,255,0.04)',
										color: '#94a3b8',
										fontSize: 13,
										cursor: 'pointer',
										transition: 'all 0.15s',
									}}
									onMouseEnter={(e) => {
										(e.target as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
										(e.target as HTMLElement).style.color = '#e2e8f0';
										(e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)';
									}}
									onMouseLeave={(e) => {
										(e.target as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
										(e.target as HTMLElement).style.color = '#94a3b8';
										(e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,0.1)';
									}}
								>
									{s}
								</button>
							))}
						</div>
					</div>
				)}

				{messages.map((msg, i) => (
					<div key={i} style={{display: 'flex', gap: 12, alignItems: 'flex-start'}}>
						<div
							style={{
								width: 28,
								height: 28,
								borderRadius: 8,
								flexShrink: 0,
								marginTop: 2,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontSize: 12,
								fontWeight: 700,
								...(msg.role === 'user'
									? {background: 'rgba(255,255,255,0.08)', color: '#94a3b8'}
									: {background: 'linear-gradient(135deg, #4f46e5, #7c3aed)', color: '#fff'}),
							}}
						>
							{msg.role === 'user' ? 'U' : 'AI'}
						</div>
						<div
							style={{
								flex: 1,
								minWidth: 0,
								padding: '12px 16px',
								borderRadius: msg.role === 'user' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
								background: msg.role === 'user' ? 'rgba(255,255,255,0.04)' : 'rgba(79,70,229,0.08)',
								border: `1px solid ${msg.role === 'user' ? 'rgba(255,255,255,0.06)' : 'rgba(79,70,229,0.15)'}`,
								color: '#e2e8f0',
								fontSize: 14,
								lineHeight: 1.65,
								whiteSpace: 'pre-wrap',
								wordBreak: 'break-word',
							}}
						>
							{msg.content}
						</div>
					</div>
				))}

				{loading && (
					<div style={{display: 'flex', gap: 12, alignItems: 'flex-start'}}>
						<div
							style={{
								width: 28,
								height: 28,
								borderRadius: 8,
								flexShrink: 0,
								background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								fontSize: 12,
								fontWeight: 700,
								color: '#fff',
							}}
						>
							AI
						</div>
						<div
							style={{
								padding: '12px 16px',
								borderRadius: '16px 4px 16px 16px',
								background: 'rgba(79,70,229,0.08)',
								border: '1px solid rgba(79,70,229,0.15)',
								color: '#94a3b8',
								fontSize: 14,
							}}
						>
							<span style={{animation: 'pulse 1.5s ease-in-out infinite'}}>Thinking...</span>
						</div>
					</div>
				)}
			</div>

			{/* Input */}
			<div
				style={{
					padding: '1rem 1.5rem',
					paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))',
					borderTop: '1px solid rgba(255,255,255,0.06)',
					background: 'rgba(255,255,255,0.02)',
					flexShrink: 0,
				}}
			>
				<div
					style={{
						maxWidth: 768,
						margin: '0 auto',
						display: 'flex',
						gap: 10,
					}}
				>
					<input
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && send()}
						placeholder="Ask about the Astral API..."
						style={{
							flex: 1,
							background: 'rgba(255,255,255,0.05)',
							border: '1px solid rgba(255,255,255,0.1)',
							borderRadius: 14,
							padding: '12px 18px',
							color: '#e2e8f0',
							fontSize: 14,
							outline: 'none',
							minHeight: 48,
						}}
						disabled={loading}
					/>
					<button
						type="button"
						onClick={() => send()}
						disabled={loading || !input.trim()}
						style={{
							background:
								!input.trim() || loading
									? 'rgba(255,255,255,0.05)'
									: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
							border: 'none',
							borderRadius: 14,
							padding: '0 20px',
							minHeight: 48,
							color: '#fff',
							fontWeight: 600,
							fontSize: 14,
							cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
							opacity: !input.trim() || loading ? 0.4 : 1,
							transition: 'opacity 0.15s, transform 0.1s',
							flexShrink: 0,
						}}
					>
						Send
					</button>
				</div>
			</div>

			<style>{`
				@keyframes pulse {
					0%, 100% { opacity: 1; }
					50% { opacity: 0.4; }
				}
			`}</style>
		</div>
	);
}
