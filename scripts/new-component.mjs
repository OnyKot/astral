#!/usr/bin/env node
/**
 * Scaffold a new React component with the boilerplate every Astral
 * component has: AGPL header, Lingui `t` + `Trans` imports, CSS module +
 * its .d.ts sibling, `observer` wrapping, and a sensible props type.
 *
 * Usage:
 *   pnpm new:component src/components/channel/FooBar
 *   pnpm new:component channel/FooBar                 # prefix src/components/ auto
 *
 * The name of the component is inferred from the last path segment. Rejects
 * if any target file already exists.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const LICENSE_HEADER = `/*
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
`;

function tsxTemplate(name) {
	return `${LICENSE_HEADER}
import {Trans, useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import React from 'react';
import styles from './${name}.module.css';

export interface ${name}Props {
	// TODO: add props
}

export const ${name} = observer<${name}Props>(function ${name}() {
	const {t} = useLingui();

	return (
		<div className={styles.root} aria-label={t\`${name}\`}>
			<Trans>New component: ${name}</Trans>
		</div>
	);
});
`;
}

function cssTemplate() {
	return `${LICENSE_HEADER}
.root {
	display: flex;
}
`;
}

function dtsTemplate() {
	return `declare const styles: {
  readonly "root": string;
};
export = styles;
`;
}

async function pathExists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

async function main() {
	const rawTarget = process.argv[2];
	if (!rawTarget) {
		console.error('Usage: pnpm new:component <path/of/Component>');
		console.error('Example: pnpm new:component src/components/channel/FooBar');
		console.error('   or:   pnpm new:component channel/FooBar');
		process.exit(1);
	}

	// Allow both "src/components/foo/Bar" and shorthand "foo/Bar".
	let rel = rawTarget.replace(/\\/g, '/').replace(/\.tsx?$/i, '');
	if (!rel.startsWith('src/')) {
		rel = `src/components/${rel}`;
	}

	const fullDir = path.join(ROOT, rel);
	const name = path.basename(fullDir);

	if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) {
		console.error(`Component name "${name}" must be PascalCase (start uppercase, alphanumeric only).`);
		process.exit(1);
	}

	const tsxPath = `${fullDir}.tsx`;
	const cssPath = `${fullDir}.module.css`;
	const dtsPath = `${fullDir}.module.css.d.ts`;

	for (const p of [tsxPath, cssPath, dtsPath]) {
		if (await pathExists(p)) {
			console.error(`Refusing to overwrite existing file: ${path.relative(ROOT, p)}`);
			process.exit(1);
		}
	}

	await fs.mkdir(path.dirname(tsxPath), {recursive: true});
	await fs.writeFile(tsxPath, tsxTemplate(name), 'utf8');
	await fs.writeFile(cssPath, cssTemplate(), 'utf8');
	await fs.writeFile(dtsPath, dtsTemplate(), 'utf8');

	const relTsx = path.relative(ROOT, tsxPath);
	const relCss = path.relative(ROOT, cssPath);
	const relDts = path.relative(ROOT, dtsPath);
	console.log(`Created ${name}:`);
	console.log(`  ${relTsx}`);
	console.log(`  ${relCss}`);
	console.log(`  ${relDts}`);
	console.log('');
	console.log('Next steps:');
	console.log(`  1. Import: import {${name}} from '~/${rel.replace(/^src\//, '')}';`);
	console.log(`  2. Run pnpm generate:css-types if you add more CSS classes to pick them up in .d.ts.`);
	console.log(`  3. Run pnpm lingui:extract after adding new t\`…\` / <Trans>.`);
}

main().catch((err) => {
	console.error('Scaffolder failed:', err.message || err);
	process.exit(1);
});
