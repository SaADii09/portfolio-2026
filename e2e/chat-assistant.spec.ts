import { test, expect, type Page } from "@playwright/test";
import { gotoApp } from "./utils";

/**
 * DevOS Chat assistant — the browser-level contract (T13 revival, the chat
 * had ZERO e2e coverage). Five pins:
 *
 * 1. LAUNCH — the "Open Dev Chat" palette row opens the Dev Chat OS window,
 *    and the one-shot concierge greeting renders with ZERO /api/chat traffic
 *    (the greeting is local, never fetched).
 * 2. STREAM + ACTIONS — a scripted SSE stream (replayed as genuinely separate
 *    chunks with real gaps, like a live provider stream) renders the full
 *    assistant text, and the `[[action:open_app:about]]` marker OPENS the
 *    About window while never leaking into the rendered bubble
 *    (AssistantMarkdown strips markers; the executor fires them through
 *    os-actions.openApp).
 * 3. PERSISTENCE — a seeded store-v2 conversation (messages + chatGreeted +
 *    unreadCount) restores across a reload (hydrating from the APP's own
 *    persist write, never re-seeded), never re-greets, and the persisted
 *    unread count renders the badge on the desktop edge tab.
 * 4. MOBILE — the FAB opens the bottom sheet ABOVE the taskbar; the sheet's
 *    own "Close chat" affordance closes it and returns the FAB. (The close
 *    affordance is the sheet's X button: there is no backdrop element and no
 *    Escape handler on the sheet — the global Escape chain covers windows,
 *    context menus, and the palette only.)
 * 5. ERROR PATH — a 502 whose body carries the friendly provider-429 copy
 *    renders that copy PREFIX-FREE (the slice maps the provider-429 body
 *    verbatim; every other error string gains an `Error: ` prefix), and the
 *    failed turn finalizes with its Retry affordance.
 * 6. FAST TAIL — the whole stream in ONE route.fulfill body (same-frame EOF):
 *    settle() flushes the final chunk and flips streaming:false in one React
 *    batch, and the executor's post-finalize re-scan still fires the marker —
 *    the About window OPENS (the fast tail must not silently lose the action).
 *
 * Determinism: EVERY /api/chat request is intercepted by `page.route` in
 * every test — the suite never touches the network and never burns provider
 * quota (house rule). Chromium only (the matrix's reference engine).
 */

/** Single truth: src/lib/ai/provider.ts FRIENDLY_429_COPY (e2e is black-box; never imported). */
const FRIENDLY_429_COPY = "The assistant is getting a lot of questions — give it a few seconds.";

/** Stable tail of the one-shot greeting (chatSlice.greet). */
const GREETING_SNIPPET = "ask me about my work, skills, or projects.";

const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

/** The scripted streaming answer — one SSE payload per provider chunk. */
const STREAM_TOKENS = ["Sure", " — opening About now.", " [[action:open_app:about]]"];
const STREAM_PAYLOADS = STREAM_TOKENS.map((text) => JSON.stringify({ type: "token", text }));

declare global {
  interface Window {
    /** Count of /api/chat requests intercepted by the in-page fetch stub. */
    __chatStubCalls?: number;
  }
}

/** Encode tokens as the client SSE contract: `data: {"type":"token","text":…}` lines. */
function sseStream(tokens: string[]): string {
  return tokens.map((text) => `data: ${JSON.stringify({ type: "token", text })}\n\n`).join("");
}

/**
 * Intercept EVERY /api/chat request with a scripted `text/event-stream`
 * answer. Returns the intercepted-request log so tests can pin request
 * counts (zero for local-only flows, one per send otherwise).
 */
async function mockChatSse(page: Page, body: string): Promise<string[]> {
  const calls: string[] = [];
  await page.route("**/api/chat", (route) => {
    calls.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/event-stream", body });
  });
  return calls;
}

/** The network guard for tests that never send: a harmless stream, still logged. */
function installChatGuard(page: Page): Promise<string[]> {
  return mockChatSse(page, sseStream(["(unreachable mock)"]));
}

/**
 * Replay SSE payloads as a live provider would: genuinely separate chunks
 * with real inter-chunk gaps, delivered by an in-page fetch stub (the
 * request never enters the network stack at all).
 *
 * WHY NOT `route.fulfill` for the streaming pin: a fulfill body arrives as
 * ONE chunk, so the client's rAF-batched token flush and the streaming→false
 * finalize land in the SAME React batch — the action executor (which only
 * observes messages while `streaming === true`) never sees the completed
 * marker, and no render ever fires between the last read and `settle()`.
 * A live stream gaps between tokens, which is the condition the stream-time
 * execution contract (spec §Action protocol) is written against.
 *
 * The `page.route` guard stays installed in the same test: if the stub ever
 * missed, the guard would answer instead of the network.
 */
async function stubChatStream(page: Page, payloads: string[]): Promise<void> {
  await page.addInitScript(
    ({ chunks }) => {
      const realFetch = window.fetch.bind(window);
      // One input → URL mapping, kept OUT of the stream closure so the fetch
      // wrapper stays branch-flat (a stacked ternary there stacks branches
      // for the complexity gate). Declared inside the init-script closure on
      // purpose: it is serialized to the page along with the wrapper.
      function requestUrl(input: RequestInfo | URL): string {
        if (typeof input === "string") return input;
        if (input instanceof URL) return input.href;
        return input.url;
      }
      window.fetch = async (input, init) => {
        if (!requestUrl(input).includes("/api/chat")) return realFetch(input, init);
        window.__chatStubCalls = (window.__chatStubCalls ?? 0) + 1;
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            for (const payload of chunks) {
              await new Promise((resolve) => setTimeout(resolve, 60));
              controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
            }
            // Hold the stream open ~300 ms after the last token — a frame or
            // more between the final token and EOF, the realistic shape of a
            // live provider stream. (The same-frame collapse itself is now
            // covered by the executor's finalize re-scan and its own fast-tail
            // pin below; this tail keeps the stub shape realistic.)
            await new Promise((resolve) => setTimeout(resolve, 300));
            controller.close();
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      };
    },
    { chunks: payloads },
  );
}

/** The Dev Chat OS window (desktop) — the only window titled "Dev Chat". */
function chatWindow(page: Page) {
  return page
    .locator(".os-window-enter")
    .filter({ has: page.locator("span.font-display", { hasText: /^Dev Chat$/ }) });
}

/** The About OS window — the target of the [[action:open_app:about]] marker. */
function aboutWindow(page: Page) {
  return page
    .locator(".os-window-enter")
    .filter({ has: page.locator("span.font-display", { hasText: /^About Me$/ }) });
}

/** The mobile bottom taskbar — the only fixed bottom-0 full-width surface. */
function mobileTaskbar(page: Page) {
  return page.locator('div[class*="fixed bottom-0 left-0 right-0"]');
}

/**
 * Launch chat through the command palette (Ctrl/Cmd+K → "chat" → Enter) —
 * the same os-actions.openApp choke point every launcher funnels through.
 */
async function openChatViaPalette(page: Page): Promise<void> {
  await page.keyboard.press("ControlOrMeta+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  const input = page.getByRole("combobox");
  await input.fill("chat");
  // The Dev Chat launcher is the TOP-RANKED (selected) match for "chat" —
  // the fuzzy subsequence scorer also surfaces "Switch theme: Classic
  // Editorial", so Enter must be proven to activate the SELECTED row, not
  // merely the only row.
  const chatRow = page.getByRole("option", { name: /Open Dev Chat/ });
  await expect(chatRow).toBeVisible();
  await expect(chatRow).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(chatWindow(page)).toBeVisible();
}

/**
 * The persisted conversation the reload pin seeds — one user/assistant
 * exchange in the stored `Message` shape (streaming finalized, ids that
 * cannot collide with the runtime's `msg-<timestamp>-<n>` monotonic ids).
 */
const SEEDED_MESSAGES = [
  {
    id: "msg-e2e-seed-1",
    role: "user",
    content: "What is DevOS?",
    timestamp: 1_735_000_000_000,
  },
  {
    id: "msg-e2e-seed-2",
    role: "assistant",
    content: "DevOS is an interactive Web OS portfolio.",
    timestamp: 1_735_000_060_000,
  },
];

/**
 * Seeds the store-v2 chat state BEFORE the first load, guarded by a
 * sessionStorage flag (which survives a reload but not a new tab) so the
 * reload below hydrates from the APP's own persist write, not the seed's
 * bytes. Shape mirrors zustand persist: `{ state, version }` over the
 * persisted chat keys (messages, unreadCount, chatGreeted — see
 * `persistPartialize` in src/store/index.ts; missing keys migrate to
 * defaults).
 */
async function seedConversation(page: Page): Promise<void> {
  const seed = {
    state: { messages: SEEDED_MESSAGES, unreadCount: 1, chatGreeted: true },
    version: 2,
  };
  await page.addInitScript((payload) => {
    if (window.sessionStorage.getItem("devos-e2e-seeded") === "1") return;
    window.sessionStorage.setItem("devos-e2e-seeded", "1");
    window.localStorage.setItem("devos-store", JSON.stringify(payload));
  }, seed);
}

test.describe("DevOS Chat assistant — desktop", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("the palette opens the Dev Chat window and the greeting renders with zero network", async ({
    page,
  }) => {
    const chatCalls = await installChatGuard(page);
    await gotoApp(page);

    await openChatViaPalette(page);

    // The one-shot concierge greeting (chatSlice.greet) fired on first open.
    await expect(chatWindow(page).getByText(GREETING_SNIPPET)).toBeVisible();

    // …without a single /api/chat request — the greeting is local state.
    expect(chatCalls.length, "the greeting must render without any /api/chat request").toBe(0);
  });

  test("a scripted SSE stream renders the answer and fires [[action:open_app:about]] stripped from the bubble", async ({
    page,
  }) => {
    // The route guard stays installed as the network-free safety net; the
    // in-page stub replays the streaming answer itself.
    const chatCalls = await installChatGuard(page);
    await stubChatStream(page, STREAM_PAYLOADS);
    await gotoApp(page);
    await openChatViaPalette(page);

    const composer = chatWindow(page).getByPlaceholder("Type a message...");
    await composer.fill("Show me your about page");
    await composer.press("Enter");

    // The visitor bubble renders verbatim.
    await expect(chatWindow(page).getByText("Show me your about page")).toBeVisible();

    // The streamed tokens land the FULL assistant text.
    await expect(chatWindow(page).getByText("Sure — opening About now.")).toBeVisible();

    // The action marker executed: the About window opened alongside the chat.
    await expect(aboutWindow(page)).toBeVisible();

    // …and the raw marker never leaked into the rendered bubble.
    await expect(chatWindow(page).getByText("[[action")).toHaveCount(0);

    // The in-page stub covered every chat request — nothing reached the
    // network stack (the route guard saw zero traffic).
    expect(chatCalls.length, "the stub must cover every /api/chat request").toBe(0);
    expect(await page.evaluate(() => window.__chatStubCalls ?? 0), "one stream per send").toBe(1);
  });

  test("a seeded conversation survives a reload, never re-greets, and the edge tab carries the unread badge", async ({
    page,
  }) => {
    await installChatGuard(page);
    await seedConversation(page);
    await gotoApp(page);

    // The desktop edge tab stands in for the (absent) chat window and carries
    // the persisted unread badge — before any chat surface was ever opened.
    const edgeTab = page.getByRole("button", { name: "Open chat, 1 unread" });
    await expect(edgeTab).toBeVisible();
    await expect(edgeTab.getByText("1", { exact: true })).toBeVisible();

    await openChatViaPalette(page);

    // The seeded history renders…
    await expect(chatWindow(page).getByText("What is DevOS?")).toBeVisible();
    await expect(
      chatWindow(page).getByText("DevOS is an interactive Web OS portfolio."),
    ).toBeVisible();
    // …and the greeting is NOT spliced in: `chatGreeted` persisted AND the
    // conversation is not bare (both gates in chatSlice.greet).
    await expect(chatWindow(page).getByText(GREETING_SNIPPET)).toHaveCount(0);

    // RELOAD: the init script no longer re-seeds (sessionStorage guard), so
    // this hydrates from the APP's own persist write — the history survives.
    await page.reload();
    await page.locator(".boot-overlay").waitFor({ state: "detached", timeout: 30_000 });

    // Windows are persisted too: the chat window is restored OPEN, so the
    // edge tab (and its badge) cannot render yet. Closing the restored
    // window surfaces the edge tab again — the unread badge survives the
    // reload on the same persist write (unreadCount is never consumed by
    // opening or closing the chat).
    const restoredClose = chatWindow(page)
      .locator(".os-drag-handle")
      .getByRole("button", { name: "Close" });
    await expect(restoredClose).toBeVisible();
    await restoredClose.click();
    const reloadedTab = page.getByRole("button", { name: "Open chat, 1 unread" });
    await expect(reloadedTab).toBeVisible();
    await expect(reloadedTab.getByText("1", { exact: true })).toBeVisible();

    await openChatViaPalette(page);
    await expect(chatWindow(page).getByText("What is DevOS?")).toBeVisible();
    await expect(
      chatWindow(page).getByText("DevOS is an interactive Web OS portfolio."),
    ).toBeVisible();
    await expect(chatWindow(page).getByText(GREETING_SNIPPET)).toHaveCount(0);
  });

  test("a 502 carrying the friendly 429 copy renders prefix-free in the bubble", async ({
    page,
  }) => {
    const chatCalls: string[] = [];
    await page.route("**/api/chat", (route) => {
      chatCalls.push(route.request().url());
      return route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: FRIENDLY_429_COPY }),
      });
    });
    await gotoApp(page);
    await openChatViaPalette(page);

    const composer = chatWindow(page).getByPlaceholder("Type a message...");
    await composer.fill("Are you rate limited?");
    await composer.press("Enter");

    // The provider-429 body IS the friendly copy — rendered verbatim…
    await expect(chatWindow(page).getByText(FRIENDLY_429_COPY)).toBeVisible();
    // …PREFIX-FREE (any other error string would gain an `Error: ` prefix).
    await expect(chatWindow(page).getByText(/^Error:/)).toHaveCount(0);

    // The turn finalized as a failure: the Retry affordance rendered.
    await expect(
      chatWindow(page).getByRole("button", { name: "Retry the last message" }),
    ).toBeVisible();

    expect(chatCalls.length, "exactly one /api/chat request per send").toBe(1);
  });

  test("a fast-tail stream — all SSE lines in one chunk, same-frame EOF — still opens About", async ({
    page,
  }) => {
    // THE RACE SHAPE (Task 4's tmp-debug probe, converted): one route.fulfill
    // body = the whole stream arrives as ONE chunk whose EOF lands in the
    // same task, so settle() flushes the buffered tokens and flips
    // streaming:false in the SAME React batch. No render ever observes the
    // completed marker with streaming:true — only the executor's
    // post-finalize re-scan can fire it.
    const chatCalls: string[] = [];
    await page.route("**/api/chat", (route) => {
      chatCalls.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: sseStream(STREAM_TOKENS),
      });
    });
    await gotoApp(page);
    await openChatViaPalette(page);

    const composer = chatWindow(page).getByPlaceholder("Type a message...");
    await composer.fill("Show me your about page");
    await composer.press("Enter");

    // The full assistant text rendered (the marker stripped from the bubble)…
    await expect(chatWindow(page).getByText("Sure — opening About now.")).toBeVisible();

    // …and the fast tail did NOT lose the action: About opened.
    await expect(aboutWindow(page)).toBeVisible();

    // The raw marker never leaked into the rendered bubble.
    await expect(chatWindow(page).getByText("[[action")).toHaveCount(0);

    expect(chatCalls.length, "exactly one /api/chat request per send").toBe(1);
  });
});

test.describe("DevOS Chat assistant — mobile bottom sheet", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "chromium only");
  test.use({ viewport: { width: 375, height: 667 } });

  test("the FAB opens the sheet above the taskbar; Close chat returns the FAB", async ({
    page,
  }) => {
    await installChatGuard(page);
    await gotoApp(page);

    const fab = page.getByLabel("Open chat");
    await expect(fab).toBeVisible();
    await fab.click();

    // While the sheet is open it is the ONLY z-[9997] surface (the FAB
    // unmounts when chatOpen flips).
    const sheet = page.locator('div[class*="z-[9997]"]');
    const composer = page.getByPlaceholder("Type a message...");
    await expect(sheet).toBeVisible();
    await expect(composer).toBeVisible();

    // The mobile surface greets too (one-shot, shared slice).
    await expect(page.getByText(GREETING_SNIPPET)).toBeVisible();

    // The sheet sits ABOVE the taskbar: its bottom edge clears the taskbar's
    // top (the sheet is bottom-anchored at var(--taskbar-height, 52px)).
    // Polled because the enter spring animates y from 100% → 0.
    const taskbarBox = await mobileTaskbar(page).boundingBox();
    expect(taskbarBox, "the mobile taskbar has a box").not.toBeNull();
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box ? box.y + box.height : Number.POSITIVE_INFINITY;
      })
      .toBeLessThanOrEqual(taskbarBox!.y + 1);

    // The sheet's own close affordance (the X button) — the FAB returns.
    await page.getByRole("button", { name: "Close chat" }).click();
    await expect(composer).toBeHidden();
    await expect(page.getByLabel("Open chat")).toBeVisible();
  });

  test("the mobile icon grid opens the same bottom sheet (device-mapped launcher)", async ({
    page,
  }) => {
    await installChatGuard(page);
    await gotoApp(page);

    // chat is device-mapped in os-actions: on mobile openApp("chat") toggles
    // the sheet instead of opening a window. The composer alone cannot pin
    // that — a floating chat window renders one too — so the SHEET surface
    // (the FAB test's unique z-[9997] check) and the ABSENCE of any chat
    // window are asserted alongside it.
    await page.getByTitle("Open Dev Chat").click();

    const sheet = page.locator('div[class*="z-[9997]"]');
    await expect(sheet).toBeVisible();
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();
    await expect(chatWindow(page)).toHaveCount(0);
  });
});
