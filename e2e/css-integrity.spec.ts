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
