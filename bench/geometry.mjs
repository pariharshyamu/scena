#!/usr/bin/env node
/**
 * What does one prop cost to draw?
 *
 *   npm run geometry            check every prop against its budget
 *   npm run geometry -- --why   name the redundant materials
 *   npm run geometry -- --json  the numbers, for a script
 *
 * ## Counters, not timings
 *
 * SCENA already gates bytes (`npm run size`). This gates the other cost — the
 * one a user pays every frame rather than once: how many draw calls a prop
 * issues, how many GPU buffers it allocates, and how many materials the
 * renderer has to bind. Those are exact integers. They do not move unless
 * behaviour moves, so they are compared exactly and there is no noise to
 * argue with.
 *
 * A prop that looks identical and draws in half the calls is strictly better,
 * and nothing in a screenshot, a type, or a unit test says which one you have.
 *
 * ## The numbers
 *
 *   draws       meshes the renderer submits. An InstancedMesh counts ONCE
 *               however many instances it carries — that is the entire point
 *               of it, and a counter that missed that would punish the fix.
 *   geometries  distinct BufferGeometry instances: GPU buffer allocations.
 *   materials   distinct Material instances the renderer must bind.
 *   programs    how many of those are distinct BY VALUE — same type, colour,
 *               roughness, maps, shader injection.
 *   redundant   `materials - programs - animated`: material objects that are
 *               identical to another one in the same prop and could have been
 *               the same object.
 *
 * ## Redundant is not always waste
 *
 * A material that owns animated state cannot be shared. SCENA's flowing water
 * and waving cloth each carry their own `uFlowTime` / `uWaveTime` uniform, so
 * a fountain's eight spouts need eight materials — sharing one would lock them
 * into unison, which looks mechanical, and is why they were built that way.
 *
 * So a material carrying a `*Uniforms` key in `userData` is EXEMPT — by that
 * rule, rather than by a hand-maintained list of exceptions that would rot.
 * Provenance tags (`scenaSurface`, `scenaGlass`) are not state and exempt
 * nothing. What is left is a material built inside a loop that did not need to
 * be, and `redundant` is budgeted at zero for it.
 */
import * as S from '../dist/index.js';

const asJson = process.argv.includes('--json');
const why = process.argv.includes('--why');

/** Everything that makes two materials different to the renderer. */
function signature(m) {
  const parts = [
    m.type, m.transparent, m.opacity, m.side, m.flatShading, m.vertexColors,
    m.roughness, m.metalness, m.emissiveIntensity, m.wireframe, m.depthWrite,
    m.depthTest, m.blending, m.toneMapped, m.alphaTest, m.fog,
  ];
  for (const k of ['color', 'emissive', 'specular', 'attenuationColor']) {
    parts.push(m[k]?.getHexString?.() ?? '-');
  }
  for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'emissiveMap']) {
    parts.push(m[k]?.uuid ?? '-');
  }
  // Two surfaces with different shader injections are different programs, and
  // the injected source is the only thing that says so.
  parts.push(m.onBeforeCompile?.toString() ?? '-');
  // And SCENA's own materials keep their real parameters in a uniform bag on
  // `userData`, not in the standard fields above. Miss those and two `wood`
  // surfaces built with different seeds read as identical when they weather
  // visibly apart — which is exactly what this gate did on its first run, and
  // it nearly cost three market baskets their variety to satisfy it.
  for (const bag of Object.values(m.userData ?? {})) {
    if (!bag || typeof bag !== 'object') continue;
    for (const [name, uniform] of Object.entries(bag)) {
      if (!uniform || typeof uniform !== 'object' || !('value' in uniform)) continue;
      parts.push(`${name}=${describe(uniform.value)}`);
    }
  }
  return parts.join('|');
}

/** A uniform's value, flattened to something comparable. */
function describe(v) {
  if (v === null || v === undefined) return '-';
  if (typeof v !== 'object') return String(v);
  if (v.isColor) return v.getHexString();
  if (v.isVector2) return `${v.x},${v.y}`;
  if (v.isVector3) return `${v.x},${v.y},${v.z}`;
  if (v.isVector4 || v.isQuaternion) return `${v.x},${v.y},${v.z},${v.w}`;
  if (v.isTexture) return v.uuid;
  if (Array.isArray(v)) return v.map(describe).join(':');
  return JSON.stringify(v);
}

/** A material carrying its own animated uniforms cannot be shared. */
const ownsState = (m) => Object.keys(m.userData ?? {}).some((k) => /Uniforms$/.test(k));

function measure(object) {
  const geometries = new Set();
  const materials = new Set();
  const byValue = new Map();
  let draws = 0;
  let instanced = 0;
  let instances = 0;
  let triangles = 0;
  let animated = 0;

  object.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isLineSegments || o.isSprite)) return;
    draws++;
    const copies = o.isInstancedMesh ? o.count : 1;
    if (o.isInstancedMesh) {
      instanced++;
      instances += o.count;
    }
    if (o.geometry) {
      geometries.add(o.geometry);
      const g = o.geometry;
      const verts = g.index ? g.index.count : (g.attributes?.position?.count ?? 0);
      // Points and lines are not triangles; counting them as such would make a
      // particle system look like a mountain.
      if (o.isMesh) triangles += (verts / 3) * copies;
    }
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m || materials.has(m)) continue;
      materials.add(m);
      if (ownsState(m)) {
        animated++;
        continue;
      }
      const s = signature(m);
      if (!byValue.has(s)) byValue.set(s, []);
      byValue.get(s).push(m);
    }
  });

  const shareable = [...byValue.values()];
  return {
    draws,
    instanced,
    instances,
    geometries: geometries.size,
    materials: materials.size,
    animated,
    programs: shareable.length,
    redundant: shareable.reduce((n, group) => n + group.length - 1, 0),
    triangles: Math.round(triangles),
    groups: shareable.filter((g) => g.length > 1),
  };
}

/**
 * The props, and what each is allowed.
 *
 * `draws`, `geometries` and `triangles` are CEILINGS on the current cost. They
 * exist to stop a prop quietly doubling, NOT to claim the current number is
 * right — it is not. Most SCENA props are a tree of individual boxes, one draw
 * call each, and merging same-material parts would collapse most of these by
 * an order of magnitude. That is its own piece of work, and this gate is what
 * will show it landing.
 *
 * `redundant` is different in kind. It is an invariant at zero, because a
 * material identical to another one in the same prop has no reason to exist,
 * and the `*Uniforms` exemption already covers every case where one does.
 */
const BUDGETS = {
  crate: { draws: 16, geometries: 16, triangles: 200 },
  rock: { draws: 2, geometries: 2, triangles: 30 },
  tree: { draws: 7, geometries: 7, triangles: 140 },
  fence: { draws: 9, geometries: 9, triangles: 160 },
  stall: { draws: 52, geometries: 52, triangles: 800 },
  statue: { draws: 9, geometries: 9, triangles: 400 },
  banner: { draws: 7, geometries: 7, triangles: 560 },
  cart: { draws: 58, geometries: 58, triangles: 2600 },
  // Two basins, each with its own water. They are separate sub-props with
  // separate lifetimes, not one loop building the same thing twice — a game
  // that stills the upper basin must not still the lower one too.
  fountain: { draws: 30, geometries: 30, triangles: 1400, redundant: 1 },
  sign: { draws: 15, geometries: 15, triangles: 1900 },
  // Three `createModernWindow` calls, each returning its own prop with its own
  // glazing. Sharing across them would mean one window's tint changed all
  // three, which is a worse bargain than three materials.
  bungalow: { draws: 66, geometries: 66, triangles: 900, redundant: 2 },
  tower: { draws: 22, geometries: 22, triangles: 320 },
  car: { draws: 27, geometries: 25, triangles: 1250 },
  boat: { draws: 8, geometries: 8, triangles: 90 },
  helicopter: { draws: 34, geometries: 30, triangles: 480 },
  plane: { draws: 35, geometries: 33, triangles: 540 },
  fighterJet: { draws: 35, geometries: 30, triangles: 520 },
};

const BUILD = {
  crate: () => S.createCrate({ seed: 1 }),
  rock: () => S.createRock({ seed: 1 }),
  tree: () => S.createTree({ seed: 1 }),
  fence: () => S.createFence({ seed: 1 }),
  stall: () => S.createStall({ seed: 1 }),
  statue: () => S.createStatue({ seed: 1 }),
  banner: () => S.createBanner({ seed: 1 }),
  cart: () => S.createCart({ seed: 1 }),
  fountain: () => S.createFountain({ seed: 1 }),
  sign: () => S.createSign({ seed: 1, text: 'HAVENBROOK' }),
  bungalow: () => S.createBungalow({ seed: 1 }),
  tower: () => S.createTower({ seed: 1 }),
  car: () => S.createCar({ seed: 1 }),
  boat: () => S.createBoat({ seed: 1 }),
  helicopter: () => S.createHelicopter({ seed: 1 }),
  plane: () => S.createPlane({ seed: 1 }),
  fighterJet: () => S.createFighterJet({ seed: 1 }),
};

const rows = [];
const failures = [];

for (const [name, budget] of Object.entries(BUDGETS)) {
  let m;
  try {
    const built = BUILD[name]();
    m = measure(built.object ?? built.mesh ?? built.group ?? built);
  } catch (error) {
    // One prop throwing must not hide the other sixteen's numbers. A gate that
    // reports the first exception and stops is a gate you have to run twice.
    failures.push(`${name}: threw — ${String(error).slice(0, 120)}`);
    continue;
  }
  rows.push({ name, ...m, budget });

  for (const key of ['draws', 'geometries', 'triangles']) {
    if (m[key] > budget[key]) failures.push(`${name}: ${key} ${m[key]} exceeds ${budget[key]}`);
  }
  if (m.redundant > (budget.redundant ?? 0)) {
    failures.push(
      `${name}: ${m.redundant} redundant material${m.redundant === 1 ? '' : 's'} ` +
        `(${m.materials} instances = ${m.programs} distinct + ${m.animated} animated)`
    );
  }
}

if (asJson) {
  console.log(JSON.stringify({ rows: rows.map(({ groups, budget, ...r }) => r) }, null, 2));
} else {
  console.log('what one prop costs to draw — exact counters, from the built bundle\n');
  console.log('  prop          draws  budget  used   geos   tris  budget   mats  anim  dup');
  console.log('  ' + '-'.repeat(74));
  for (const r of rows) {
    const used = `${Math.round((r.draws / r.budget.draws) * 100)}%`;
    console.log(
      `  ${r.name.padEnd(12)} ${String(r.draws).padStart(5)} ${String(r.budget.draws).padStart(7)} ` +
        `${used.padStart(5)} ${String(r.geometries).padStart(6)} ${String(r.triangles).padStart(6)} ` +
        `${String(r.budget.triangles).padStart(7)} ${String(r.materials).padStart(6)} ` +
        `${String(r.animated).padStart(5)} ${String(r.redundant).padStart(4)}`
    );
  }

  const draws = rows.reduce((n, r) => n + r.draws, 0);
  const dup = rows.reduce((n, r) => n + r.redundant, 0);
  console.log(`\n  ${rows.length} props, ${draws} draw calls between them, ${dup} redundant materials`);
  console.log(
    '  Draw counts are ceilings on today’s cost, not a claim that it is right:\n' +
      '  most props are a tree of one-box meshes and would merge down hard.'
  );

  if (why) {
    console.log('\n  redundant materials — identical by value, and not animated');
    for (const r of rows) {
      for (const group of r.groups) {
        const m = group[0];
        console.log(
          `  ${r.name.padEnd(12)} ${group.length} copies  ${m.type}` +
            ` #${m.color?.getHexString?.() ?? '?'} rough=${m.roughness} metal=${m.metalness}`
        );
      }
    }
  }
}

if (failures.length) {
  console.error('\nOVER BUDGET');
  for (const line of failures) console.error(`  ${line}`);
  console.error(
    '\nA redundant material is one built inside a loop that did not need to be.\n' +
      'Hoist it, or memoize it on the value that actually varies. If it truly\n' +
      'owns animated state, that state belongs in `userData` as `*Uniforms` —\n' +
      'which is what exempts it, and what makes the exemption legible.'
  );
  process.exit(1);
}

if (!asJson) console.log('\nevery prop within budget ✓');
