/// <reference path="../../preview.d.ts" />

/**
 * The single place the build-time `COLOSSUS_PREVIEW` constant is read.
 *
 * The triple-slash reference above pins the ambient declaration to this file,
 * so the symbol resolves under any tsconfig that reaches this module — `files`,
 * `include` or a bare `tsc --noEmit`. Everywhere else imports `PREVIEW_MODE`
 * instead of touching the global, which is why a missing `preview.d.ts` in some
 * project's file set can no longer break the build in a dozen places at once.
 *
 * The identifier stays free (never shadowed by a local `declare`), so esbuild's
 * `define` still substitutes it literally: `false` for the production build,
 * `true` for the `mockup` configuration. Every `if (PREVIEW_MODE)` branch is
 * therefore constant-folded and dropped from the shipped bundle.
 */
export const PREVIEW_MODE = COLOSSUS_PREVIEW;
