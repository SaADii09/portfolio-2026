import { test, expect } from "@playwright/test";

test("served CSS keeps standard backdrop-filter declarations", async ({ request }) => {
  const html = await (await request.get("http://localhost:3000/")).text();
  const cssHrefs = [...html.matchAll(/\/_next[^"']*\.css[^"']*/g)].map((m) => m[0]);
  expect(cssHrefs.length, "stylesheet links found in html").toBeGreaterThan(0);
  const matched = await Promise.all(
    cssHrefs.map(
      async (href) =>
        (await (await request.get(`http://localhost:3000${href}`)).text()).match(
          // NOTE: `\b` would also match inside `-webkit-backdrop-filter` — use a
          // negative lookbehind so only the genuinely unprefixed declaration counts.
          /(?<![-\w])backdrop-filter\s*:\s*blur\(/,
        ) !== null,
    ),
  );
  expect(matched.some(Boolean), "standard backdrop-filter in some stylesheet").toBe(true);
});

test("served CSS carries the browser start-page compaction container (short-window B1)", async ({
  request,
}) => {
  // The unit suite can only read SOURCE css; this pin proves the rules
  // SURVIVED the Tailwind + lightningcss pipeline into the served stylesheet
  // (the container setup + the @container compaction block).
  const html = await (await request.get("http://localhost:3000/")).text();
  const cssHrefs = [...html.matchAll(/\/_next[^"']*\.css[^"']*/g)].map((m) => m[0]);
  expect(cssHrefs.length, "stylesheet links found in html").toBeGreaterThan(0);
  const sheets = await Promise.all(
    cssHrefs.map(async (href) => (await request.get(`http://localhost:3000${href}`)).text()),
  );
  const all = sheets.join("\n");
  // lightningcss may minify the longhands into the shorthand — accept either.
  const containerSetup =
    /\.browser-tab-panel[^{]*\{[^}]*container-type:\s*size[^}]*\}/.test(all) ||
    /\.browser-tab-panel[^{]*\{[^}]*container:\s*tabpanel\s*\/\s*size/.test(all);
  expect(containerSetup, "the tab panel is a size container named tabpanel").toBe(true);
  expect(all).toContain("@container tabpanel");
  expect(all).toMatch(/@container tabpanel[^{]*\{[^}]*browser-tile-label/);
});
