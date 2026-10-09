import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(new URL('../../../flow/admin/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.ok(process.env.WPSUITE_WORDPRESS_CSS, 'Provide the real WordPress admin CSS with WPSUITE_WORDPRESS_CSS.');
const wpCss = await readFile(process.env.WPSUITE_WORDPRESS_CSS, 'utf8');
const outputDir = process.env.WPSUITE_SWITCH_EVIDENCE ?? '/tmp/wpsuite-ai-kit-switch';
await mkdir(outputDir, { recursive: true });
const bundle = await build({
  absWorkingDir: root, bundle: true, write: false, outfile: '/tmp/ai-kit-switch-fixture.js',
  format: 'iife', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' },
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { MantineProvider, Stack, Switch, Checkbox } from '@mantine/core';
    import '@mantine/core/styles.css'; import classes from './src/main.module.css';
    const switches = <Stack>
      <Switch label="Enabled switch" defaultChecked />
      <Switch label="Unchecked switch" />
      <Switch label="Disabled checked switch" disabled defaultChecked />
      <Switch label="Disabled unchecked switch" disabled />
      <Checkbox label="Regular Mantine checkbox" defaultChecked />
    </Stack>;
    createRoot(document.getElementById('fixture')).render(<MantineProvider>
      <section aria-label="Answers wizard" className={classes.answersSurface}><h2>Set up Answers</h2>{switches}</section>
      <section aria-label="Detailed settings" id="smartcloud-ai-kit-admin"><div className={classes['wpc-container']}><h2>General settings</h2>{switches}</div></section>
    </MantineProvider>);
  ` },
});
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = bundle.outputFiles.find(file => file.path.endsWith('.css')).text;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
try {
  for (const wpLast of [true, false]) {
    for (const width of [1280, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      try {
        await page.setContent('<body class="wp-admin wp-core-ui"><div id="fixture"></div><label>Native WordPress<input id="native" type="checkbox" checked></label></body>');
        for (const style of wpLast ? [css, wpCss] : [wpCss, css]) await page.addStyleTag({ content: style });
        await page.addScriptTag({ content: js });
        for (const name of ['Answers wizard', 'Detailed settings']) {
          const section = page.getByRole('region', { name, exact: true });
          await section.getByRole('switch', { name: 'Enabled switch', exact: true }).waitFor();
          const state = await section.locator('.mantine-Switch-input').evaluateAll(inputs => inputs.map(input => {
            const style = getComputedStyle(input);
            const track = getComputedStyle(input.nextElementSibling);
            return { opacity: style.opacity, position: style.position, margin: style.margin, display: style.display, visibility: style.visibility, trackOpacity: track.opacity, width: input.offsetWidth, height: input.offsetHeight };
          }));
          assert.equal(state.length, 4);
          for (const item of state) {
            assert.equal(item.opacity, '0', `No extra native checkbox: ${JSON.stringify(item)}`);
            assert.equal(item.position, 'absolute');
            assert.equal(item.margin, '0px');
            assert.notEqual(item.display, 'none', 'Input remains in the accessibility tree.');
            assert.equal(item.visibility, 'visible');
            assert.ok(item.width > 0 && item.height > 0, 'Input remains interactive.');
            assert.equal(item.trackOpacity, '1', 'Visual switch track remains visible.');
          }
          const enabled = section.getByRole('switch', { name: 'Enabled switch', exact: true });
          await enabled.focus();
          await page.keyboard.press('Space');
          assert.equal(await enabled.isChecked(), false, 'Keyboard toggles switch.');
          await section.locator('label').filter({ hasText: /^Enabled switch$/ }).click();
          assert.equal(await enabled.isChecked(), true, 'Associated label toggles switch.');
          const unchecked = section.getByRole('switch', { name: 'Unchecked switch', exact: true });
          await unchecked.focus();
          await page.keyboard.press('Space');
          assert.equal(await unchecked.isChecked(), true);
          assert.equal(await section.getByRole('switch', { name: 'Disabled checked switch', exact: true }).isDisabled(), true);
          assert.equal(await section.getByRole('switch', { name: 'Disabled unchecked switch', exact: true }).isDisabled(), true);
          const checkbox = section.getByRole('checkbox', { name: 'Regular Mantine checkbox', exact: true });
          assert.equal(await checkbox.evaluate(input => getComputedStyle(input).opacity), '1', 'Ordinary Mantine checkbox is still visible.');
          await checkbox.uncheck();
          assert.equal(await checkbox.isChecked(), false);
        }
        assert.notEqual(await page.locator('#native').evaluate(input => getComputedStyle(input, '::before').content), 'none', 'Ordinary WP checkbox styles are preserved.');
        assert.equal(await page.locator('#native').evaluate(input => getComputedStyle(input).opacity), '1');
        if (wpLast) await page.screenshot({ path: `${outputDir}/switch-${width}.png`, fullPage: true });
      } finally { await page.close(); }
    }
  }
  console.log('Passed AI Kit switch visibility, disabled/checked states, label and keyboard access, regular checkbox isolation, both CSS orders, desktop/mobile.');
} finally { await browser.close(); }
