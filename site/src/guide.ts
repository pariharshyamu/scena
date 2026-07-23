import { renderMarkdown } from './markdown';

const PAGES: Array<{ id: string; title: string; playground?: string }> = [
  { id: 'getting-started', title: 'Getting started', playground: 'world' },
  { id: 'environment', title: 'Terrain, sky, water, weather', playground: 'living' },
  { id: 'props', title: 'Props & palettes', playground: 'props' },
  { id: 'surfaces', title: 'Procedural surfaces', playground: 'surfaces' },
  { id: 'signs', title: 'Signposts & text', playground: 'signs' },
  { id: 'wind', title: 'Wind & swaying flora', playground: 'wind' },
  { id: 'scatter', title: 'Scattering & LOD', playground: 'forest' },
  { id: 'settlement', title: 'Villages, buildings & kits', playground: 'village' },
  { id: 'manifests', title: 'Manifests & markers', playground: 'manifest' },
  { id: 'handshake', title: 'The GAMA handshake', playground: 'path' },
];

/** Playground examples relevant to sections, keyed by heading id. */
const SECTION_PLAYGROUNDS: Record<string, string> = {
  terrain: 'world',
  'water-shores': 'living',
  'the-day-night-cycle': 'living',
  wind: 'living',
  'paths-one-curve-three-jobs': 'path',
  'the-prop-catalogue': 'props',
  palettes: 'palettes',
  'market-stalls-statues': 'market',
  'flags-banners-waving': 'banners',
  'braziers-campfires': 'fire',
  'bunting-fountains-carts': 'fair',
  'text-without-textures-fonts-or-loaders': 'signs',
  'the-four-signs': 'signs',
  'lettering-on-anything': 'signs',
  'how-it-works': 'wind',
  'one-field-many-props': 'wind',
  'reading-the-wind-on-the-cpu': 'wind',
  'composing-with-surfaces': 'wind',
  presets: 'surfaces',
  'why-it-stays-cheap-and-correct': 'surfaces',
  'adopted-by-the-props': 'surfaces',
  'scatter-in-one-call': 'forest',
  'lod-tiles': 'lod',
  'createvillage': 'village',
  'kits-ascii-architecture': 'kit',
  'buildscene-a-world-from-json': 'manifest',
  'steering-around-props': 'path',
};

const sidebar = document.getElementById('sidebar') as HTMLElement;
const content = document.getElementById('content') as HTMLElement;
const current = new URLSearchParams(location.search).get('page') ?? PAGES[0].id;

async function load(): Promise<void> {
  const page = PAGES.find((p) => p.id === current) ?? PAGES[0];
  const response = await fetch(`./docs/${page.id}.md`);
  if (!response.ok) {
    content.innerHTML = `<p>Could not load <code>${page.id}</code>.</p>`;
    return;
  }
  const { html, headings } = renderMarkdown(await response.text());
  content.innerHTML = html;

  // Inject "open in playground" links after sections that have live demos.
  for (const heading of content.querySelectorAll('h2[id], h3[id]')) {
    const example = SECTION_PLAYGROUNDS[heading.id];
    if (!example) continue;
    const link = document.createElement('a');
    link.className = 'try';
    link.href = `playground.html?example=${example}`;
    link.textContent = '▸ open a live example in the playground';
    heading.after(link);
  }

  const pagesHtml = PAGES.map(
    (p) =>
      `<a class="${p.id === page.id ? 'active' : ''}" href="guide.html?page=${p.id}">${p.title}</a>`
  ).join('');
  const tocHtml = headings
    .filter((h) => h.level === 2)
    .map((h) => `<a class="toc" href="#${h.id}">${h.text}</a>`)
    .join('');
  sidebar.innerHTML =
    `<h4>Guides</h4>${pagesHtml}` + (tocHtml ? `<h4>On this page</h4>${tocHtml}` : '');

  document.title = `${page.title} · SCENA`;
  if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
}

load();
