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

import {motion, AnimatePresence} from 'framer-motion';
import {useState, useEffect, useCallback} from 'react';
import {Trans} from '@lingui/react/macro';
import styles from './LoveWallPage.module.css';

interface LoveNote {
	id: string;
	text: string;
	author: string;
	timestamp: number;
	color: string;
}

const NOTE_COLORS = [
	'#FFB3BA', // light pink
	'#FFDFBA', // light peach
	'#FFFFBA', // light yellow
	'#BAFFC9', // light green
	'#BAE1FF', // light blue
	'#E8BAFF', // light purple
	'#FFBAE8', // light magenta
];

const DEFAULT_NOTES: LoveNote[] = [
	{
		id: '1',
		text: 'Astral brings people together ✨',
		author: 'Anonymous',
		timestamp: Date.now() - 86400000,
		color: '#FFB3BA',
	},
	{
		id: '2',
		text: 'Love the community here! ❤️',
		author: 'StarGazer',
		timestamp: Date.now() - 172800000,
		color: '#BAFFC9',
	},
	{
		id: '3',
		text: 'Best messaging platform ever 💜',
		author: 'NightOwl',
		timestamp: Date.now() - 259200000,
		color: '#BAE1FF',
	},
	{
		id: '4',
		text: 'Thank you for building this! 🌟',
		author: 'Dreamer',
		timestamp: Date.now() - 345600000,
		color: '#FFFFBA',
	},
];

const STORAGE_KEY = 'astral-love-wall';

export function LoveWallPage() {
	const [notes, setNotes] = useState<LoveNote[]>(DEFAULT_NOTES);
	const [isFormOpen, setIsFormOpen] = useState(false);
	const [newNote, setNewNote] = useState({text: '', author: ''});
	const [isHovered, setIsHovered] = useState(false);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			try {
				const parsed = JSON.parse(stored);
				if (Array.isArray(parsed) && parsed.length > 0) {
					setNotes(parsed);
				}
			} catch {
				// Use default notes
			}
		}
	}, []);

	const saveNotes = useCallback((newNotes: LoveNote[]) => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(newNotes));
	}, []);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!newNote.text.trim()) return;

		const note: LoveNote = {
			id: Date.now().toString(),
			text: newNote.text.trim(),
			author: newNote.author.trim() || 'Anonymous',
			timestamp: Date.now(),
			color: NOTE_COLORS[Math.floor(Math.random() * NOTE_COLORS.length)],
		};

		const updatedNotes = [note, ...notes];
		setNotes(updatedNotes);
		saveNotes(updatedNotes);
		setNewNote({text: '', author: ''});
		setIsFormOpen(false);
	};

	const formatTime = (timestamp: number) => {
		const diff = Date.now() - timestamp;
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		return 'just now';
	};

	if (!mounted) return null;

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<h1 className={styles.title}>
					<Trans>Wall of</Trans>{' '}
					<motion.span
						className={styles.loveWord}
						onHoverStart={() => setIsHovered(true)}
						onHoverEnd={() => setIsHovered(false)}
					>
						<Trans>Love</Trans>
						<motion.span
							className={styles.emoji}
							animate={
								isHovered
									? {
											scale: [1, 1.2, 1],
										}
									: {scale: 1}
							}
							transition={{
								duration: 0.7,
								repeat: isHovered ? Infinity : 0,
								ease: 'easeInOut',
							}}
						>
							💖
						</motion.span>
					</motion.span>
				</h1>
				<p className={styles.subtitle}>
					<Trans>Oops! This page doesn't exist, but you're here — and that's what matters.</Trans>
				</p>
			</div>

			<div
				className={styles.folderContainer}
				onClick={() => setIsFormOpen(!isFormOpen)}
			>
				<motion.div
					className={styles.folderBack}
					animate={{rotateX: isFormOpen ? -35 : 0}}
					transition={{type: 'spring', duration: 0.5, bounce: 0.2}}
				>
					<div className={styles.folderCover}>
						<svg viewBox="0 0 235 121" className={styles.folderSvg}>
							<path
								d="M104.615 0.350494L33.1297 0.838776C32.7542 0.841362 32.3825 0.881463 32.032 0.918854C31.6754 0.956907 31.3392 0.992086 31.0057 0.992096H31.0047C30.6871 0.99235 30.3673 0.962051 30.0272 0.929596C29.6927 0.897686 29.3384 0.863802 28.9803 0.866119L13.2693 0.967682H13.2527L13.2352 0.969635C13.1239 0.981406 13.0121 0.986674 12.9002 0.986237H9.91388C8.33299 0.958599 6.76052 1.22345 5.27423 1.76651H5.27325C4.33579 2.11246 3.48761 2.66213 2.7879 3.37393L2.49689 3.68839L2.492 3.69424C1.62667 4.73882 1.00023 5.96217 0.656067 7.27725C0.653324 7.28773 0.654065 7.29886 0.652161 7.30948C0.3098 8.62705 0.257231 10.0048 0.499817 11.3446L12.2147 114.399L12.2156 114.411L12.2176 114.423C12.6046 116.568 13.7287 118.508 15.3934 119.902C17.058 121.297 19.1572 122.056 21.3231 122.049V122.05H215.379C217.76 122.02 220.064 121.192 221.926 119.698V119.697C223.657 118.384 224.857 116.485 225.305 114.35L225.307 114.339L235.914 53.3798L235.968 53.1093L235.97 53.0985L235.971 53.0888C236.134 51.8978 236.044 50.685 235.705 49.5321C235.307 48.1669 234.63 46.9005 233.717 45.8144L233.383 45.4296C232.58 44.5553 231.614 43.8449 230.539 43.3398C229.311 42.7628 227.971 42.4685 226.616 42.4774H146.746C144.063 42.4705 141.423 41.8004 139.056 40.5263C136.691 39.2522 134.671 37.4127 133.175 35.1689L113.548 5.05948L113.544 5.05362L113.539 5.04776C112.545 3.65165 111.238 2.51062 109.722 1.72061C108.266 0.886502 106.627 0.422235 104.952 0.365143V0.364166L104.633 0.350494H104.615Z"
								fill="var(--background-tertiary)"
								stroke="var(--border-subtle)"
								strokeWidth="1.5"
							/>
						</svg>
						<div className={styles.folderDetails}>
							<div className={styles.folderDots}>
								<div className={styles.folderDot} />
								<div className={styles.folderDot} />
							</div>
							<div className={styles.folderLine} />
						</div>
					</div>
				</motion.div>

				<div className={styles.flyingPages}>
					{[
						{rotate: -8, x: -70, y: -75, delay: 0},
						{rotate: 1, x: 2, y: -95, delay: 0.1},
						{rotate: 9, x: 75, y: -80, delay: 0.2},
					].map((page, i) => (
						<motion.div
							key={i}
							className={styles.flyingPage}
							initial={{rotate: i === 0 ? -3 : i === 1 ? 0 : 3.5, x: i === 0 ? -38 : i === 1 ? 0 : 42, y: i === 0 ? 2 : i === 1 ? 0 : 1}}
							animate={
								isFormOpen
									? {rotate: page.rotate, x: page.x, y: page.y}
									: {rotate: i === 0 ? -3 : i === 1 ? 0 : 3.5, x: i === 0 ? -38 : i === 1 ? 0 : 42, y: i === 0 ? 2 : i === 1 ? 0 : 1}
							}
							transition={{
								type: 'spring',
								bounce: 0.15,
								stiffness: 160,
								damping: 22,
								delay: isFormOpen ? page.delay : 0,
							}}
						>
							<div className={styles.pageContent}>
								<div className={styles.pageLines}>
									<div className={styles.pageLine} />
									{Array.from({length: 6}).map((_, j) => (
										<div key={j} className={styles.pageRow}>
											<div className={styles.pageLine} />
											<div className={styles.pageLine} />
										</div>
									))}
								</div>
							</div>
						</motion.div>
					))}
				</div>
			</div>

			<div className={styles.notesSection}>
				<p className={styles.notesCount}>
					<Trans>{notes.length} love notes on this wall</Trans>
				</p>

				<div className={styles.notesGrid}>
					<AnimatePresence>
						{notes.map((note) => (
							<motion.div
								key={note.id}
								className={styles.note}
								style={{backgroundColor: note.color}}
								initial={{opacity: 0, scale: 0.8, rotate: -5}}
								animate={{opacity: 1, scale: 1, rotate: 0}}
								exit={{opacity: 0, scale: 0.8}}
								transition={{type: 'spring', bounce: 0.3, stiffness: 200}}
							>
								<p className={styles.noteText}>{note.text}</p>
								<div className={styles.noteFooter}>
									<span className={styles.noteAuthor}>{note.author}</span>
									<span className={styles.noteTime}>{formatTime(note.timestamp)}</span>
								</div>
							</motion.div>
						))}
					</AnimatePresence>
				</div>

				<motion.div
					className={styles.addNoteButton}
					onClick={() => setIsFormOpen(!isFormOpen)}
					whileHover={{scale: 1.02}}
					whileTap={{scale: 0.98}}
				>
					<div className={styles.addIcon}>+</div>
					<span><Trans>Add Your Love Note</Trans></span>
				</motion.div>

				<AnimatePresence>
					{isFormOpen && (
						<motion.form
							className={styles.noteForm}
							initial={{opacity: 0, y: 20, height: 0}}
							animate={{opacity: 1, y: 0, height: 'auto'}}
							exit={{opacity: 0, y: -10, height: 0}}
							transition={{type: 'spring', bounce: 0.2}}
							onSubmit={handleSubmit}
						>
							<textarea
								className={styles.noteInput}
								placeholder="Write something lovely..."
								value={newNote.text}
								onChange={(e) => setNewNote({...newNote, text: e.target.value})}
								maxLength={200}
								rows={3}
							/>
							<input
								type="text"
								className={styles.authorInput}
								placeholder="Your name (optional)"
								value={newNote.author}
								onChange={(e) => setNewNote({...newNote, author: e.target.value})}
								maxLength={30}
							/>
							<button type="submit" className={styles.submitButton}>
								<Trans>Post Note</Trans>
							</button>
						</motion.form>
					)}
				</AnimatePresence>
			</div>

			<div className={styles.homeLink}>
				<a href="/channels/@me">
					<Trans>← Back to Home</Trans>
				</a>
			</div>
		</div>
	);
}

export default LoveWallPage;
