// SCENA — text: lettering carved from an embedded font
//
// A sub-path entry point. `import from 'scena3d'` still gives you everything;
// this exists so a bundler can see module boundaries, and so an import says
// what part of the library it depends on.
//
// GENERATED from src/index.ts by scripts/entries.mjs — every statement below
// is the root barrel's own, partitioned by source directory. `npm run
// entries:check` fails if this file and the barrel disagree.

export {
  buildTextGeometry,
  measureText,
  type TextOptions,
  type TextGeometry,
  type TextAlign,
} from './text/textGeometry';
