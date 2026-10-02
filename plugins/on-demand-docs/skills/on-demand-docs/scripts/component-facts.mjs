#!/usr/bin/env node
// Collect facts about a component for the doc writer:
//   - field reference from the dialog YAML in the light module
//   - pages in Magnolia that use the component
//
//   node tools/component-facts.mjs <light-module-dir> <componentName> [outFile]
//   node tools/component-facts.mjs - <templateId> [outFile]      (no source code: usages only;
//                                                                 fields come from a captureFields scenario step)
//   e.g. node tools/component-facts.mjs light-modules/mis-travel-components tourHighlight runs/x/facts.json
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { MagnoliaRest } from './lib/magnolia-rest.mjs';

const [moduleDir, name, outFile] = process.argv.slice(2);
if (!moduleDir || !name) {
  console.error('usage: component-facts.mjs <light-module-dir> <componentName> [outFile]');
  process.exit(2);
}
const noCode = moduleDir === '-';
const templateId = noCode ? name : `${path.basename(moduleDir)}:components/${name}`;
const readYaml = (p) => (!noCode && fs.existsSync(p) ? yaml.load(fs.readFileSync(p, 'utf8')) : null);

const template = readYaml(path.join(moduleDir, 'templates/components', `${name}.yaml`)) || {};
const dialog = readYaml(path.join(moduleDir, 'dialogs/components', `${name}.yaml`)) || {};

const TYPE_LABELS = {
  textField: 'Text', richTextField: 'Rich text', checkBoxField: 'Checkbox', damLinkField: 'Asset (image) picker',
  pageLinkField: 'Page picker', linkField: 'Link picker', radioButtonGroupField: 'Radio buttons',
  comboBoxField: 'Drop-down', selectField: 'Drop-down', dateField: 'Date', switchableField: 'Switchable',
};

const fields = Object.entries(dialog.form?.properties || {}).map(([key, f]) => ({
  name: key,
  label: f.label || key,
  type: TYPE_LABELS[f.$type] || f.$type,
  rawType: f.$type,
  required: !!f.required,
  default: f.defaultValue ?? null,
  description: f.description || '',
  options: (f.datasource?.options || []).map((o) => o.label || o.value),
}));

let usages = [];
try {
  const rest = new MagnoliaRest({ baseUrl: process.env.MAGNOLIA_URL, user: process.env.MAGNOLIA_USER, password: process.env.MAGNOLIA_PASSWORD });
  usages = await rest.findUsages(templateId, process.env.MAGNOLIA_SITE_ROOT || '/');
} catch (e) {
  console.error('usage lookup failed:', e.message);
}

const facts = {
  templateId,
  source: noCode ? 'magnolia-only' : 'light-module',
  title: template.title || dialog.label || name,
  description: template.description || '',
  fields,
  usages,
  collectedAt: new Date().toISOString(),
};
const json = JSON.stringify(facts, null, 2);
if (outFile) fs.writeFileSync(outFile, json);
console.log(json);
