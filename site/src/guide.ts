import { renderMarkdown } from './markdown';

const PAGES: Array<{ id: string; title: string; playground?: string }> = [
  { id: 'getting-started', title: 'Getting started', playground: 'world' },
  { id: 'environment', title: 'Terrain, sky, water, weather', playground: 'living' },
  { id: 'props', title: 'Props & palettes', playground: 'props' },
  { id: 'surfaces', title: 'Procedural surfaces', playground: 'surfaces' },
  { id: 'signs', title: 'Signposts & text', playground: 'signs' },
  { id: 'wind', title: 'Wind & swaying flora', playground: 'wind' },
  { id: 'precipitation', title: 'Rain & snow', playground: 'weather' },
  { id: 'weather', title: 'Weather controller', playground: 'weathersys' },
  { id: 'ocean', title: 'Sea waves', playground: 'ocean' },
  { id: 'underwater', title: 'God rays, caustics & bubbles', playground: 'underwater' },
  { id: 'sailing', title: 'Sailing, polars & laylines', playground: 'sail' },
  { id: 'alongside', title: 'Mooring, fenders & gangways', playground: 'berth' },
  { id: 'oars', title: 'Under oars', playground: 'oars' },
  { id: 'steam', title: 'Steam, cut-off & the store', playground: 'steam' },
  { id: 'trim', title: 'Trim & the free surface', playground: 'trim' },
  { id: 'liner', title: 'Stabilisers & motion', playground: 'liner' },
  { id: 'sea', title: 'Sea state, fetch & swell', playground: 'sea' },
  { id: 'gear', title: 'Working gear & girting', playground: 'gear' },
  { id: 'craft', title: 'Small craft & swamping', playground: 'craft' },
  { id: 'coast', title: 'Lights, sectors & the horizon', playground: 'coast' },
  { id: 'plumbing', title: 'Plumbing, pressure & the scald', playground: 'plumbing' },
  { id: 'flock', title: 'Flocks & schools', playground: 'flock' },
  { id: 'herd', title: 'Herds & grazing', playground: 'herd' },
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
  'tree-species': 'trees',
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
  'gpu-driven-thousands-of-particles-no-cpu-work': 'weather',
  'snow-that-settles': 'weather',
  'a-storm-composed': 'weather',
  'named-states': 'weathersys',
  'one-controller-every-piece': 'weathersys',
  'custom-states': 'weathersys',
  'reading-it': 'weathersys',
  'seasons-turning-a-whole-wood': 'seasons',
  'gerstner-swell-not-a-sine-plane': 'ocean',
  'the-shore-handshake': 'ocean',
  'buoyancy-heightat': 'ocean',
  'god-rays': 'underwater',
  'caustics': 'underwater',
  'bubbles': 'underwater',
  'water-grade': 'underwater',
  'putting-it-together': 'underwater',
  'storm-surge': 'surge',
  'drive-is-a-curve-not-a-throttle': 'sail',
  'four-rigs-four-different-curves': 'sail',
  'the-layline-where-to-point-when-you-cant-point-at-it': 'sail',
  'heel-is-not-a-fraction-of-drive': 'sail',
  'luffing-and-why-the-no-go-is-learnable': 'sail',
  'composing-with-the-deck': 'sail',
  'a-rope-is-a-one-way-constraint': 'berth',
  'springs': 'berth',
  'working-her': 'berth',
  'a-gangway-is-where-two-frames-blend': 'berth',
  'berths': 'berth',
  'thrust-is-a-pulse': 'oars',
  'it-takes-several-bodies-agreeing': 'oars',
  'catching-a-crab': 'oars',
  'working-her-2': 'oars',
  'kinds': 'oars',
  'the-store-is-the-whole-model': 'steam',
  'the-needle-that-does-not-move': 'steam',
  'she-needs-notice': 'steam',
  'full-ahead-is-not-her-fastest': 'steam',
  'dead-centre': 'steam',
  'what-the-funnel-tells-you-and-what-it-does-not': 'steam',
  'shut-her-in-before-you-reverse': 'steam',
  'the-kinds-and-what-each-asks-of-you': 'steam',
  'the-weight-is-not-the-problem-the-fact-that-it-can-move-is': 'trim',
  'an-empty-ship-is-not-a-safe-ship': 'trim',
  'there-is-an-angle-past-which-she-does-not-come-back': 'trim',
  'the-sea-gets-in-faster-than-the-pump-gets-it-out': 'trim',
  'what-you-can-do-about-it': 'trim',
  'the-load-line': 'trim',
  'what-the-hull-takes': 'trim',
  'the-only-thing-here-that-stops-working-when-you-stop': 'liner',
  'they-take-the-roll-out-and-leave-the-pitch': 'liner',
  'motion-is-a-field': 'liner',
  'where-the-fins-show-and-where-they-do-not': 'liner',
  'what-each-of-them-asks-of-you': 'liner',
  'the-whole-arc-in-one-hull': 'liner',
  'the-wind-drops-and-the-sea-does-not': 'sea',
  'you-cannot-make-an-ocean-sea-in-a-lake': 'sea',
  'two-seas-at-once-from-different-directions': 'sea',
  'a-swell-tells-you-how-far-it-came': 'sea',
  'the-four-states': 'sea',
  'the-surface-a-boat-floats-on-is-the-surface-you-can-see': 'sea',
  'the-wire-comes-abeam-and-the-boat-is-gone': 'gear',
  'her-own-gear-cannot-sink-her-and-that-is-the-point': 'gear',
  'the-strain-is-a-thing-you-control-with-the-throttle': 'gear',
  'how-fast-you-can-be-rid-of-it': 'gear',
  'a-hanging-load-and-a-towed-one-are-different-sums': 'gear',
  'the-load-is-in-the-world-not-on-her-deck': 'gear',
  'what-it-costs-her': 'gear',
  'into-the-hold-by-the-same-door-a-bad-stow-uses': 'gear',
  'the-same-load-on-something-it-is-heavy-for': 'gear',
  'she-is-not-lost-to-stability-she-is-lost-to-freeboard': 'craft',
  'it-is-a-runaway-and-nothing-else-in-this-library-is': 'craft',
  'you-cannot-bail-your-way-out-of-it': 'craft',
  'where-they-sit-decides-what-sea-she-can-live-in': 'craft',
  'standing-up-barely-touches-her-and-that-is-the-finding': 'craft',
  'a-breaker-does-not-care-what-her-gm-is': 'craft',
  'what-happens-after-she-fills': 'craft',
  'buoyancy-buys-no-seconds-whatever': 'craft',
  'coming-back-up-is-not-the-same-as-being-all-right': 'craft',
  'the-handshakes': 'craft',
  'the-curvature-decides-it-and-the-lamp-does-not': 'coast',
  'the-same-light-the-same-night-and-two-boats-that-see-differently': 'coast',
  'coming-up-on-it': 'coast',
  'what-tells-you-it-is-that-light-and-not-another-one': 'coast',
  'in-range-and-lit-are-different-questions': 'coast',
  'a-sectored-light-tells-you-where-you-are': 'coast',
  'fog-eats-the-lamp-and-the-horizon-does-not-care': 'coast',
  'the-daymark': 'coast',
  'what-no-frame-can-show': 'coast',
  'the-shower-scalds-when-the-lavatory-is-flushed': 'plumbing',
  'set-it-by-temperature-because-that-is-what-a-person-does': 'plumbing',
  'what-happens-to-the-person-in-the-shower': 'plumbing',
  'the-store-empties-seven-times-faster-than-it-fills': 'plumbing',
  'height-is-pressure': 'plumbing',
  'what-the-supply-is-being-asked-to-do': 'plumbing',
  'the-resistance-that-matters-is-the-branch': 'plumbing',
  'boids-then-one-draw-call': 'flock',
  'birds-and-fish': 'flock',
  'reading-the-flock': 'flock',
  'boids-on-the-ground': 'herd',
  'grazing-then-walking': 'herd',
  'deer-and-sheep': 'herd',
  'reading-the-herd': 'herd',
  presets: 'surfaces',
  'why-it-stays-cheap-and-correct': 'surfaces',
  'adopted-by-the-props': 'surfaces',
  'modern-machined': 'modern',
  'glass-createglass': 'modern',
  'scatter-in-one-call': 'forest',
  'lod-tiles': 'lod',
  'billboard-impostors-for-giant-forests': 'giants',
  'createvillage': 'village',
  'kits-ascii-architecture': 'kit',
  'modern-bungalows-createbungalow': 'bungalow',
  'towers-createhighrise': 'skyline',
  'interiors-createroom': 'interior',
  'daylight-createinteriorlight': 'interior',
  'furnishing-furnishroom': 'interior',
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
