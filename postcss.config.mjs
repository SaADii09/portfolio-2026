/** Lightningcss (>=1.21) strips the standard `backdrop-filter` declaration
 * whenever a `-webkit-` twin with a concrete (non-var) value exists, and Turbopack
 * runs its own bundled lightningcss pass where an npm override cannot reach.
 * A standard-only declaration is never stripped, so: mirror the standard name
 * from every -webkit-only declaration, then drop the redundant -webkit- twin. */
const unlowerBackdropFilter = () => ({
  postcssPlugin: "postcss-unlower-backdrop-filter",
  Declaration(decl) {
    if (decl.prop !== "-webkit-backdrop-filter") return;
    const parent = decl.parent;
    const hasStandard = parent?.nodes.some(
      (n) => n.type === "decl" && n.prop === "backdrop-filter" && !n.important === !decl.important,
    );
    if (parent && !hasStandard) parent.insertBefore(decl, decl.clone({ prop: "backdrop-filter" }));
    // The -webkit- twin makes lightningcss dedupe away the standard property.
    // std-only input always survives, so the twin is the only thing to lose.
    if (parent) decl.remove();
  },
});

export default {
  plugins: [
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- runtime require below; static bundling it breaks lightningcss's conditional native require
    require(/* turbopackIgnore: true */ "@tailwindcss/postcss"),
    unlowerBackdropFilter(),
  ],
};
