/**
 * Renders App Store screenshots from the demo story (Alex's groups).
 * Output PNGs are opaque RGB, at the sizes App Store Connect asks for.
 */
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fonts = {
  display: path.join(root, 'node_modules/@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf'),
  body: path.join(root, 'node_modules/@expo-google-fonts/hanken-grotesk/500Medium/HankenGrotesk_500Medium.ttf'),
  bodyStrong: path.join(root, 'node_modules/@expo-google-fonts/hanken-grotesk/600SemiBold/HankenGrotesk_600SemiBold.ttf'),
};

const paper = '#F2EAD9';
const surface = '#FBF6EC';
const ink = '#2B2620';
const inkSoft = '#6A5F52';
const inkFaint = '#A3947E';
const hairline = '#E4D9C3';
const brand = '#4C6444';
const brandDeep = '#3A4E34';
const brandSoft = '#E7ECDD';
const high = '#C04A3C';
const overdueSurface = '#F6E1DC';
const moss = '#6E7A3C';
const dusk = '#5B6E7A';
const terracotta = '#C16E43';

const mineTasks = [
  { title: 'Print programmes', space: 'Choir', color: dusk, meta: 'Doing · Fri', overdue: false },
  { title: 'Water the greenhouse', space: 'Garden crew', color: moss, meta: 'To do · Tomorrow', overdue: false },
  { title: 'Label the seedlings', space: 'Garden crew', color: moss, meta: 'Doing · in 3 days', overdue: false },
  { title: 'Book the boiler service', space: 'Household', color: terracotta, meta: 'To do · Overdue', overdue: true },
  { title: 'Sketch the spring menu', space: 'Personal', color: brand, meta: 'To do', overdue: false },
];

const gardenTasks = [
  { title: 'Water the greenhouse', who: 'Alex Rivera', meta: 'To do · Tomorrow', overdue: false, done: false },
  { title: 'Turn the compost', who: 'Sam Okonkwo', meta: 'To do · in 2 days', overdue: false, done: false },
  { title: 'Order seed potatoes', who: 'Unassigned', meta: 'To do · in 10 days', overdue: false, done: false },
  { title: 'Label the seedlings', who: 'Alex Rivera', meta: 'Doing · in 3 days', overdue: false, done: false },
  { title: 'Fix the gate', who: 'Priya Shah', meta: 'Done', overdue: false, done: true },
];

const choirTasks = [
  { title: 'Print programmes', who: 'Alex Rivera', space: 'Choir', color: dusk, meta: 'Doing · Fri', overdue: false, done: false },
  { title: 'Confirm the soloist', who: 'Sam Okonkwo', space: 'Choir', color: dusk, meta: 'To do · in 4 days', overdue: false, done: false },
];

function esc(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function card(x, y, w, h, task, showWho) {
  const fill = task.overdue ? overdueSurface : surface;
  const who = showWho ? `<text x="${x + 28}" y="${y + h - 28}" fill="${inkFaint}" font-family="Hanken Grotesk" font-size="22">${esc(task.who)}</text>` : '';
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${fill}" stroke="${hairline}"/>
    <circle cx="${x + 36}" cy="${y + 42}" r="8" fill="${task.color || moss}"/>
    <text x="${x + 56}" y="${y + 50}" fill="${ink}" font-family="Hanken Grotesk" font-size="28" font-weight="600">${esc(task.title)}</text>
    <text x="${x + 28}" y="${y + (showWho ? 92 : 96)}" fill="${task.overdue ? high : inkSoft}" font-family="Hanken Grotesk" font-size="22">${esc(showWho ? task.meta : `${task.space} · ${task.meta}`)}</text>
    ${who}
  `;
}

function phone(width, height, mode) {
  const tasks = mode === 'garden' ? gardenTasks : mode === 'household' ? choirTasks : mineTasks;
  const title = mode === 'garden' ? 'Garden crew' : mode === 'household' ? 'Choir' : 'Mine';
  const subtitle = mode === 'mine'
    ? 'Everything assigned to you'
    : mode === 'garden'
      ? 'The whole shared list'
      : 'Sam’s task is on the list too';
  const showWho = mode === 'garden';
  const cardH = showWho ? 150 : 132;
  const gap = 18;
  const x = 48;
  const w = width - 96;
  let y = 280;
  const cards = tasks.slice(0, mode === 'household' ? 1 : 5).map((task) => {
    const node = card(x, y, w, cardH, task, showWho);
    y += cardH + gap;
    return node;
  }).join('');
  const dot = mode === 'mine' ? '' : `<circle cx="72" cy="168" r="10" fill="${mode === 'garden' ? moss : dusk}"/>`;
  const titleX = mode === 'mine' ? 56 : 96;
  return `
    <rect width="${width}" height="${height}" fill="${paper}"/>
    <text x="56" y="92" fill="${inkFaint}" font-family="Hanken Grotesk" font-size="26">9:41</text>
    ${dot}
    <text x="${titleX}" y="178" fill="${ink}" font-family="Fraunces" font-size="64">${title}</text>
    <text x="56" y="230" fill="${inkSoft}" font-family="Hanken Grotesk" font-size="28">${subtitle}</text>
    ${cards}
    <circle cx="${width - 110}" cy="${height - 150}" r="58" fill="${brand}"/>
    <text x="${width - 128}" y="${height - 136}" fill="${surface}" font-family="Hanken Grotesk" font-size="64">+</text>
  `;
}

function wide(width, height, mode) {
  const sidebar = 420;
  const columns = [
    { label: 'To do', items: gardenTasks.filter((task) => task.meta.startsWith('To do') && !task.done) },
    { label: 'Doing', items: gardenTasks.filter((task) => task.meta.startsWith('Doing')) },
    { label: 'Done', items: gardenTasks.filter((task) => task.done) },
  ];
  if (mode === 'mine') {
    columns[0].items = mineTasks.filter((task) => task.meta.includes('To do')).map((task) => ({
      ...task,
      who: task.space,
    }));
    columns[1].items = mineTasks.filter((task) => task.meta.startsWith('Doing')).map((task) => ({ ...task, who: task.space }));
    columns[2].items = [];
  } else if (mode === 'choir') {
    columns[0].items = choirTasks.filter((task) => task.meta.startsWith('To do'));
    columns[1].items = choirTasks.filter((task) => task.meta.startsWith('Doing'));
    columns[2].items = [];
  }
  const heading = mode === 'mine' ? 'Mine' : mode === 'choir' ? 'Choir' : 'Garden crew';
  const note = mode === 'mine'
    ? 'Assigned to Alex, from every group'
    : mode === 'choir'
      ? 'The shared list, not only your part'
      : 'Everyone in the crew sees this list';
  const colW = (width - sidebar - 120) / 3;
  const cols = columns.map((column, index) => {
    const x = sidebar + 40 + index * (colW + 20);
    const cards = column.items.slice(0, 4).map((task, row) => {
      const y = 250 + row * 150;
      return `
        <rect x="${x}" y="${y}" width="${colW - 10}" height="132" rx="18" fill="${task.overdue ? overdueSurface : surface}" stroke="${hairline}"/>
        <text x="${x + 24}" y="${y + 48}" fill="${ink}" font-family="Hanken Grotesk" font-size="26" font-weight="600">${esc(task.title)}</text>
        <text x="${x + 24}" y="${y + 92}" fill="${task.overdue ? high : inkSoft}" font-family="Hanken Grotesk" font-size="20">${esc(task.who || task.meta)}</text>
      `;
    }).join('');
    return `
      <text x="${x}" y="210" fill="${inkFaint}" font-family="Hanken Grotesk" font-size="22">${column.label}</text>
      ${cards}
    `;
  }).join('');
  const nav = [
    ['Mine', mode === 'mine'],
    ['My Week', false],
    ['Personal', false],
    ['Household', false],
    ['Garden crew', mode === 'garden'],
    ['Choir', mode === 'choir'],
  ].map(([label, active], index) => {
    const y = 220 + index * 72;
    return `
      <rect x="24" y="${y}" width="${sidebar - 48}" height="60" rx="16" fill="${active ? brandSoft : 'none'}"/>
      <text x="48" y="${y + 40}" fill="${active ? brandDeep : ink}" font-family="Hanken Grotesk" font-size="26">${label}</text>
    `;
  }).join('');
  return `
    <rect width="${width}" height="${height}" fill="${paper}"/>
    <rect width="${sidebar}" height="${height}" fill="${surface}"/>
    <text x="48" y="100" fill="${brandDeep}" font-family="Fraunces" font-size="42">Trove</text>
    ${nav}
    <text x="${sidebar + 48}" y="110" fill="${ink}" font-family="Fraunces" font-size="54">${heading}</text>
    <text x="${sidebar + 48}" y="156" fill="${inkSoft}" font-family="Hanken Grotesk" font-size="24">${note}</text>
    ${cols}
  `;
}

const sets = [
  { dir: 'iphone-6.9', width: 1320, height: 2868, layout: 'phone' },
  { dir: 'iphone-6.5', width: 1284, height: 2778, layout: 'phone' },
  { dir: 'ipad-13', width: 2752, height: 2064, layout: 'wide' },
  { dir: 'mac', width: 2880, height: 1800, layout: 'wide' },
];

const shots = [
  { name: '01-mine', mode: 'mine' },
  { name: '02-garden-crew', mode: 'garden' },
  { name: '03-across-groups', mode: 'household' },
];

function flatten(buffer) {
  const src = PNG.sync.read(buffer);
  const out = new PNG({ width: src.width, height: src.height, colorType: 2, inputHasAlpha: false });
  for (let i = 0, j = 0; i < src.data.length; i += 4, j += 3) {
    const alpha = src.data[i + 3] / 255;
    out.data[j] = Math.round(src.data[i] * alpha + 0xf2 * (1 - alpha));
    out.data[j + 1] = Math.round(src.data[i + 1] * alpha + 0xea * (1 - alpha));
    out.data[j + 2] = Math.round(src.data[i + 2] * alpha + 0xd9 * (1 - alpha));
  }
  return PNG.sync.write(out);
}

async function renderOne(svg, width, file) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    background: paper,
    font: {
      fontFiles: [fonts.display, fonts.body, fonts.bodyStrong],
      loadSystemFonts: false,
      defaultFontFamily: 'Hanken Grotesk',
    },
  });
  const png = flatten(resvg.render().asPng());
  await writeFile(file, png);
  const converted = spawnSync(
    'python3',
    [
      '-c',
      'from PIL import Image; import sys; Image.open(sys.argv[1]).convert("RGB").save(sys.argv[1], format="PNG")',
      file,
    ],
    { stdio: 'inherit' },
  );
  if (converted.status !== 0) throw new Error(`Could not flatten ${file}`);
}

const outRoot = path.join(root, 'store/screenshots');
for (const set of sets) {
  const dir = path.join(outRoot, set.dir);
  await mkdir(dir, { recursive: true });
  for (const shot of shots) {
    const mode = shot.mode === 'household' && set.layout === 'wide' ? 'choir' : shot.mode;
    const body = set.layout === 'phone' ? phone(set.width, set.height, shot.mode) : wide(set.width, set.height, mode);
    const name = shot.mode === 'household' ? '03-choir' : shot.name;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${set.width}" height="${set.height}" viewBox="0 0 ${set.width} ${set.height}">${body}</svg>`;
    const file = path.join(dir, `${name}.png`);
    await renderOne(svg, set.width, file);
    console.log(file);
  }
}
