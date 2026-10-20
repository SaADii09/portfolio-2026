"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type UIEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ExternalLink,
  GitFork,
  Globe,
  Home,
  PanelRight,
  Play,
  Plus,
  RotateCw,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { useStore } from "@/store";
import type { AppStore } from "@/store";
import type { BrowserTab, BrowserWindowState } from "@/store/browserSlice";
import { computeWarmSet } from "@/lib/warm-set";
import { BROWSER_TILES, type BrowserTile } from "@/lib/browser-apps";
import { projectBySlug } from "@/lib/portfolio-data";
import { ProjectGrid } from "@/components/apps/ProjectGrid";
import { ReadmeView } from "@/components/apps/ReadmeView";
import { WebView } from "@/components/os/WebView";
import { FallbackPanel } from "@/components/os/FallbackPanel";
import type { ProjectMeta } from "@/app/api/project-meta/route";

/**
 * DevOS Browser shell (spec §7, Task 9): toolbar (back/forward over the
 * active tab's localHistory, reload, address bar, external-open, side-panel
 * toggle), Chrome-like tab strip, and the warm-tail content router — one
 * container per warm tab (`computeWarmSet`: active + 2 MRU) keyed per tab
 * with the `hidden` attribute on inactive ones; sleeping tabs render nothing
 * and remount on wake (§7.5).
 */

const TILE_ICONS: Record<string, LucideIcon> = {
  search: Search,
  play: Play,
  // This lucide release ships no brand icons — the "github" tile key maps to
  // the closest git glyph (the `Github` export the Task 5 registry comment
  // anticipated does not exist in lucide-react here).
  github: GitFork,
  globe: Globe,
};

// Module-level store selectors — flat arrows keep the tree's cognitive weight
// out of the components (each hook site just calls useStore(selectX)).
const selectWindowState = (windowId: string) => (s: AppStore) => s.browserWindows[windowId];
const selectSidePanelOpen = (s: AppStore) => s.sidePanelOpen;
const selectOpenBrowserWindow = (s: AppStore) => s.openBrowserWindow;
const selectOpenProjectTab = (s: AppStore) => s.openProjectTab;
const selectOpenHomeTab = (s: AppStore) => s.openHomeTab;
const selectActivateTab = (s: AppStore) => s.activateTab;
const selectCloseTab = (s: AppStore) => s.closeTab;
const selectNavigateActive = (s: AppStore) => s.navigateActive;
const selectToggleSidePanel = (s: AppStore) => s.toggleSidePanel;
const selectConsumePendingSlug = (s: AppStore) => s.consumePendingSlug;

/** Tile lookup by exact url — blocked tiles render FallbackPanel, no iframe. */
function tileFor(url: string): BrowserTile | undefined {
  return BROWSER_TILES.find((tile) => tile.url === url);
}

function isBlockedUrl(url: string): boolean {
  return tileFor(url)?.kind === "blocked";
}

/** Address-bar parse: prepend https:// when the entry carries no scheme. */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/** `owner/name` path of a repo URL — the /api/project-meta `repo` param. */
function repoParam(repoUrl: string): string | null {
  try {
    return new URL(repoUrl).pathname.split("/").filter(Boolean).join("/");
  } catch {
    return null;
  }
}

/** N3: one fetch feeds BOTH slice caches (meta + README HTML when present). */
function storeMeta(slug: string, meta: ProjectMeta): void {
  const { pushMeta, pushReadme } = useStore.getState();
  pushMeta(slug, meta);
  if (meta.readmeHtml !== null) pushReadme(slug, meta.readmeHtml);
}

async function fetchProjectMeta(
  repoUrl: string,
  slug: string,
  onDone: () => void,
  onFail: () => void,
): Promise<void> {
  const repo = repoParam(repoUrl);
  if (repo === null) {
    onFail();
    return;
  }
  try {
    const res = await fetch(`/api/project-meta?repo=${encodeURIComponent(repo)}`);
    if (!res.ok) throw new Error(`project-meta ${res.status}`);
    storeMeta(slug, (await res.json()) as ProjectMeta);
    onDone();
  } catch {
    onFail();
  }
}

/**
 * Fetch gate (F2 network-free wake): an explicit revalidate (reload button)
 * always fetches; otherwise only a cache miss does — waking a sleeping tab
 * whose caches are warm repaints with zero network.
 */
function needsFetch(slug: string, reloadKey: number): boolean {
  if (reloadKey > 0) return true;
  const { readmeLru, metaLru } = useStore.getState();
  if (readmeLru[slug] === undefined) return true;
  return metaLru[slug] === undefined;
}

function isMetaDegraded(meta: ProjectMeta | undefined): boolean {
  if (meta === undefined) return false;
  if (meta.degraded) return true;
  return meta.readmeHtml === null;
}

/** ReadmeView's degraded latch: no body, a failed fetch, or a degraded meta. */
function readmeDegraded(
  readme: string | undefined,
  fetchFailed: boolean,
  meta: ProjectMeta | undefined,
): boolean {
  if (readme === undefined) return true;
  if (fetchFailed) return true;
  return isMetaDegraded(meta);
}

/** Cursor into a web tab's localHistory, stored per tab and clamped to range. */
function cursorFor(cursors: Record<string, number>, tab: BrowserTab): number {
  const stored = cursors[tab.id];
  const last = tab.localHistory.length - 1;
  if (stored === undefined) return last;
  return Math.min(Math.max(stored, 0), last);
}

function webUrlAt(tab: BrowserTab, cursor: number): string {
  const at = tab.localHistory[cursor];
  if (at !== undefined) return at;
  return tab.url ?? "";
}

/** Location the router embeds for a tab — empty outside the web path. */
function webUrlOf(tab: BrowserTab, navCursors: Record<string, number>): string {
  if (tab.kind !== "web") return "";
  return webUrlAt(tab, cursorFor(navCursors, tab));
}

function projectRepoUrl(tab: BrowserTab): string {
  const entry = projectBySlug(tab.slug ?? "");
  if (entry === undefined) return "";
  return entry.repoUrl;
}

/** What the address bar shows for the active tab (home stays empty). */
function displayUrlFor(tab: BrowserTab, cursor: number): string {
  if (tab.kind === "home") return "";
  if (tab.kind !== "project") return webUrlAt(tab, cursor);
  return projectRepoUrl(tab);
}

function activeTabOf(windowState: BrowserWindowState | undefined): BrowserTab | undefined {
  return windowState?.tabs.find((tab) => tab.id === windowState.activeTabId);
}

function webCursorOf(cursors: Record<string, number>, tab: BrowserTab | undefined): number {
  if (tab === undefined) return 0;
  return cursorFor(cursors, tab);
}

function activeUrlOf(tab: BrowserTab | undefined, cursor: number): string {
  if (tab === undefined) return "";
  return displayUrlFor(tab, cursor);
}

/** Warm-tail membership for display: tabs ordered along the computeWarmSet. */
function warmTabsOf(windowState: BrowserWindowState): BrowserTab[] {
  const warmIds = computeWarmSet(windowState.recency, windowState.activeTabId);
  return windowState.tabs.filter((tab) => warmIds.includes(tab.id));
}

function reloadIndexOf(reloadKeys: Record<string, number>, tabId: string): number {
  const stored = reloadKeys[tabId];
  if (stored === undefined) return 0;
  return stored;
}

/** Honest toolbar enablement for the active tab (web-only navigation). */
function navCaps(
  tab: BrowserTab,
  cursor: number,
): { canBack: boolean; canForward: boolean; canReload: boolean } {
  const isWeb = tab.kind === "web";
  return {
    canBack: isWeb && cursor > 0,
    canForward: isWeb && cursor < tab.localHistory.length - 1,
    canReload: tab.kind !== "home",
  };
}

/** Next cursor map after a Back step — unchanged map when already at 0. */
function navCursorAfterBack(
  cursors: Record<string, number>,
  tab: BrowserTab,
  cursor: number,
): Record<string, number> {
  if (cursor <= 0) return cursors;
  return { ...cursors, [tab.id]: cursor - 1 };
}

/** Next cursor map after a Forward step — unchanged map at the tip. */
function navCursorAfterForward(
  cursors: Record<string, number>,
  tab: BrowserTab,
  cursor: number,
): Record<string, number> {
  if (cursor >= tab.localHistory.length - 1) return cursors;
  return { ...cursors, [tab.id]: cursor + 1 };
}

/** Next cursor map after navigateActive pushes — the new appended tip. */
function navCursorAfterNavigate(
  cursors: Record<string, number>,
  tab: BrowserTab,
): Record<string, number> {
  return { ...cursors, [tab.id]: tab.localHistory.length };
}

/** Bumped per-tab reload counter — remounts iframes, revalidates readmes. */
function reloadKeyBumped(prev: Record<string, number>, tabId: string): Record<string, number> {
  return { ...prev, [tabId]: (prev[tabId] ?? 0) + 1 };
}

/** Parsed address target for the active tab; null when the tab can't navigate. */
function addressTargetUrl(raw: string, tab: BrowserTab): string | null {
  if (tab.kind !== "web") return null;
  return normalizeUrl(raw);
}

/** Tile favicon glyph — resolves to Globe when the tile lookup misses. */
function TileGlyph({ tile, size }: { tile: BrowserTile | undefined; size: number }) {
  if (tile === undefined) return <Globe size={size} />;
  const Icon = TILE_ICONS[tile.icon] ?? Globe;
  return <Icon size={size} />;
}

function TabIcon({ tab }: { tab: BrowserTab }) {
  if (tab.kind === "home") return <Home size={12} />;
  if (tab.kind === "project") return <BookOpen size={12} />;
  return <TileGlyph tile={tileFor(tab.url ?? "")} size={12} />;
}

function TileButton({ tile, onOpen }: { tile: BrowserTile; onOpen: () => void }) {
  const Icon = TILE_ICONS[tile.icon] ?? Globe;
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-2 px-3 py-2 rounded-os glass glass-pos glass-border font-body text-xs text-os-text transition-all hover:-translate-y-0.5 hover:glow-sm cursor-pointer"
    >
      <Icon size={14} className="text-os-accent shrink-0" />
      {tile.name}
    </button>
  );
}

/** New-tab page: the shared ProjectGrid plus the curated site tiles. */
function HomeTabBody({ windowId }: { windowId: string }) {
  const openProjectTab = useStore((s) => s.openProjectTab);
  const openWebTab = useStore((s) => s.openWebTab);

  return (
    <div className="flex flex-col gap-5 p-4">
      <section aria-label="Projects">
        <h3 className="font-display text-xs text-os-accent mb-2">Projects</h3>
        <ProjectGrid onOpen={(slug) => openProjectTab(windowId, slug)} />
      </section>
      <section aria-label="Open a site">
        <h3 className="font-display text-xs text-os-accent mb-2">Open a site</h3>
        <div className="flex flex-wrap gap-2">
          {BROWSER_TILES.map((tile) => (
            <TileButton
              key={tile.url}
              tile={tile}
              onOpen={() => openWebTab(windowId, tile.url, tile.name)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function UnknownProjectNotice() {
  return <p className="p-4 font-body text-sm text-os-muted">Unknown project.</p>;
}

/**
 * README reader for a project tab: first paint comes from `readmeLru` (sleep/
 * wake is network-free when both caches are warm); on a miss — or an explicit
 * revalidate — one `/api/project-meta` fetch feeds both caches (N3).
 */
function ReadmeBody({ slug, reloadKey }: { slug: string; reloadKey: number }) {
  const readme = useStore((s) => s.readmeLru[slug]);
  const meta = useStore((s) => s.metaLru[slug]);
  const entry = projectBySlug(slug);
  const [fetchFailed, setFetchFailed] = useState(false);

  useEffect(() => {
    if (entry === undefined || !needsFetch(slug, reloadKey)) return;
    let cancelled = false;
    void fetchProjectMeta(
      entry.repoUrl,
      slug,
      () => {
        if (!cancelled) setFetchFailed(false);
      },
      () => {
        if (!cancelled) setFetchFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [entry, slug, reloadKey]);

  if (entry === undefined) return <UnknownProjectNotice />;
  const degraded = readmeDegraded(readme, fetchFailed, meta);
  return <ReadmeView html={readme ?? ""} degraded={degraded} slug={slug} />;
}

function ProjectTabBody({ tab, reloadKey }: { tab: BrowserTab; reloadKey: number }) {
  const slug = tab.slug;
  if (slug === undefined) return <UnknownProjectNotice />;
  return <ReadmeBody slug={slug} reloadKey={reloadKey} />;
}

/**
 * Web-tab content: blocked tiles render the fallback instantly (spec §6 —
 * no blank-iframe flash); a recorded probe refusal renders the panel with a
 * retry that clears the verdict; everything else goes through the WebView
 * embed pipeline (probe/watchdog → screenshot fallback).
 */
function WebTabBody({ windowId, tab, url }: { windowId: string; tab: BrowserTab; url: string }) {
  const setActiveRefusal = useStore((s) => s.setActiveRefusal);

  if (tab.refusal === true) {
    return (
      <FallbackPanel
        url={url}
        allowScreenshot
        onRetry={() => setActiveRefusal(windowId, tab.id, false)}
      />
    );
  }
  if (isBlockedUrl(url)) {
    return <FallbackPanel url={url} allowScreenshot />;
  }
  return <WebView url={url} />;
}

/** Router branch per tab kind — one arm per Browser content path (G5). */
function TabContent({
  windowId,
  tab,
  reloadKey,
  url,
}: {
  windowId: string;
  tab: BrowserTab;
  reloadKey: number;
  url: string;
}) {
  if (tab.kind === "home") return <HomeTabBody windowId={windowId} />;
  if (tab.kind === "project") return <ProjectTabBody tab={tab} reloadKey={reloadKey} />;
  return <WebTabBody windowId={windowId} tab={tab} url={url} />;
}

/**
 * One warm tab's container: `hidden` (display:none) on inactive ones keeps
 * warm iframes alive with zero re-mount cost. Because display:none discards
 * DOM scroll state (and a sleeping tab remounts fresh), the persisted
 * `scrollTop` is restored from the slice record whenever the panel becomes
 * the visible one — before first paint, via useLayoutEffect.
 */
function TabPanel({
  windowId,
  tab,
  active,
  children,
}: {
  windowId: string;
  tab: BrowserTab;
  active: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const setScrollTop = useStore((s) => s.setScrollTop);

  useLayoutEffect(() => {
    if (!active) return;
    const el = panelRef.current;
    if (el !== null) el.scrollTop = tab.scrollTop;
  }, [active, tab.id, tab.scrollTop]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(windowId, tab.id, event.currentTarget.scrollTop);
  };

  return (
    <div
      ref={panelRef}
      data-tab-id={tab.id}
      hidden={!active}
      className="browser-tab-panel absolute inset-0 overflow-y-auto"
      onScroll={handleScroll}
    >
      {children}
    </div>
  );
}

/** All warm tabs' containers — the §7.5 mounting rule made declarative. */
function TabPanels({
  windowId,
  warmTabs,
  activeTabId,
  navCursors,
  reloadKeys,
}: {
  windowId: string;
  warmTabs: BrowserTab[];
  activeTabId: string | null;
  navCursors: Record<string, number>;
  reloadKeys: Record<string, number>;
}) {
  return (
    <div className="relative flex-1 min-h-0">
      {warmTabs.map((tab) => (
        <TabPanel
          key={`tab-${tab.id}`}
          windowId={windowId}
          tab={tab}
          active={tab.id === activeTabId}
        >
          <TabContent
            key={`content-${tab.id}-${reloadIndexOf(reloadKeys, tab.id)}`}
            windowId={windowId}
            tab={tab}
            reloadKey={reloadIndexOf(reloadKeys, tab.id)}
            url={webUrlOf(tab, navCursors)}
          />
        </TabPanel>
      ))}
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  disabled = false,
  pressed,
  active = false,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** Set only on toggle buttons — React omits the attribute when undefined. */
  pressed?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  const tone = active
    ? "glass-border-active text-os-accent"
    : "glass-border text-os-muted hover:text-os-text";
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`flex items-center justify-center w-7 h-7 shrink-0 rounded-os glass glass-pos transition-all hover:scale-110 active:scale-95 disabled:opacity-40 disabled:hover:scale-100 cursor-pointer ${tone}`}
    >
      {children}
    </button>
  );
}

/** Chrome-like geometry row 1: nav buttons, address bar, external, panel. */
function Toolbar({
  tab,
  currentUrl,
  caps,
  sidePanelOpen,
  onAddressSubmit,
  onBack,
  onForward,
  onReload,
  onToggleSidePanel,
}: {
  tab: BrowserTab;
  currentUrl: string;
  caps: { canBack: boolean; canForward: boolean; canReload: boolean };
  sidePanelOpen: boolean;
  onAddressSubmit: (raw: string) => void;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onToggleSidePanel: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 pb-2 shrink-0">
      <ToolButton label="Back" disabled={!caps.canBack} onClick={onBack}>
        <ArrowLeft size={14} />
      </ToolButton>
      <ToolButton label="Forward" disabled={!caps.canForward} onClick={onForward}>
        <ArrowRight size={14} />
      </ToolButton>
      <ToolButton label="Reload" disabled={!caps.canReload} onClick={onReload}>
        <RotateCw size={14} />
      </ToolButton>
      {/*
        Uncontrolled and keyed by location: typing never re-renders React
        state, and any location change (tab switch, navigate, back/forward)
        remounts the input showing the new url — no store→state sync effect
        (react-hooks/set-state-in-effect) needed.
      */}
      <input
        key={`${tab.id}:${currentUrl}`}
        type="text"
        aria-label="Address bar"
        defaultValue={currentUrl}
        disabled={tab.kind !== "web"}
        placeholder={addressPlaceholder(tab.kind)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onAddressSubmit(event.currentTarget.value);
        }}
        className="flex-1 min-w-0 px-2 py-1 text-xs font-body rounded-os glass glass-pos glass-border bg-os-surface-alt text-os-text placeholder:text-os-muted focus:outline-none focus:glow-sm disabled:opacity-50"
      />
      {currentUrl !== "" && (
        <a
          href={currentUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open external"
          className="flex items-center justify-center w-7 h-7 shrink-0 rounded-os text-os-muted transition-all hover:scale-110 hover:text-os-accent cursor-pointer"
        >
          <ExternalLink size={14} />
        </a>
      )}
      <ToolButton
        label="Toggle side panel"
        pressed={sidePanelOpen}
        active={sidePanelOpen}
        onClick={onToggleSidePanel}
      >
        <PanelRight size={14} />
      </ToolButton>
    </div>
  );
}

/** Address-bar placeholder — honest empty affordance on the home tab. */
function addressPlaceholder(kind: BrowserTab["kind"]): string {
  if (kind === "home") return "Search or enter address";
  return "";
}

function tabChipTone(active: boolean): string {
  if (active) return "glass-border-active text-os-accent";
  return "glass-border text-os-muted hover:text-os-text";
}

/** Chrome-like geometry row 2: tab chips + the new-tab button. */
function TabStrip({
  windowId,
  tabs,
  activeTabId,
  activate,
  close,
  openHome,
}: {
  windowId: string;
  tabs: BrowserTab[];
  activeTabId: string | null;
  activate: (windowId: string, tabId: string) => void;
  close: (windowId: string, tabId: string) => void;
  openHome: (windowId: string) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Browser tabs"
      className="flex items-center gap-1 overflow-x-auto pb-1 shrink-0"
    >
      {tabs.map((tab) => (
        <div key={tab.id} className="flex items-center shrink-0">
          <button
            role="tab"
            aria-selected={tab.id === activeTabId}
            onClick={() => activate(windowId, tab.id)}
            className={`flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-os glass glass-pos font-body text-xs transition-all cursor-pointer ${tabChipTone(tab.id === activeTabId)}`}
          >
            <TabIcon tab={tab} />
            <span className="truncate max-w-[140px]">{tab.title}</span>
          </button>
          <button
            aria-label={`Close ${tab.title}`}
            onClick={() => close(windowId, tab.id)}
            className="flex items-center justify-center w-5 h-5 rounded-os text-os-muted transition-all hover:scale-110 hover:text-os-text cursor-pointer"
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button
        aria-label="New tab"
        onClick={() => openHome(windowId)}
        className="flex items-center justify-center w-7 h-7 shrink-0 rounded-os glass glass-pos glass-border text-os-muted transition-all hover:scale-110 hover:text-os-accent cursor-pointer"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export interface BrowserAppProps {
  /** The OS window this browser instance is mounted in. */
  windowId: string;
}

/**
 * Mount-time wiring only: the idempotent re-seed for rehydrated windows and
 * the exactly-once `pendingSlug` consumption (the launcher writes the payload
 * through the store; the freshly mounted app turns it into a project tab).
 */
function useBrowserBootstrap(windowId: string) {
  const openBrowserWindow = useStore(selectOpenBrowserWindow);
  const openProjectTab = useStore(selectOpenProjectTab);
  const consumePendingSlug = useStore(selectConsumePendingSlug);

  // Re-seed on mount — idempotent, covers rehydrated windows whose slice
  // record was dropped (browser state is deliberately not persisted).
  useEffect(() => {
    openBrowserWindow(windowId);
  }, [windowId, openBrowserWindow]);

  useEffect(() => {
    const slug = consumePendingSlug();
    if (slug !== null) openProjectTab(windowId, slug);
  }, [windowId, consumePendingSlug, openProjectTab]);
}

export function BrowserApp({ windowId }: BrowserAppProps) {
  const windowState = useStore(selectWindowState(windowId));
  const sidePanelOpen = useStore(selectSidePanelOpen);
  const navigateActive = useStore(selectNavigateActive);
  const toggleSidePanel = useStore(selectToggleSidePanel);
  const activateTab = useStore(selectActivateTab);
  const closeTab = useStore(selectCloseTab);
  const openHomeTab = useStore(selectOpenHomeTab);

  useBrowserBootstrap(windowId);

  // Back/forward position per web tab (localHistory cursor); reload counters
  // per tab (remounts the active iframe / revalidates the active readme).
  const [navCursors, setNavCursors] = useState<Record<string, number>>({});
  const [reloadKeys, setReloadKeys] = useState<Record<string, number>>({});

  const activeTab = activeTabOf(windowState);
  const cursor = webCursorOf(navCursors, activeTab);
  const currentUrl = activeUrlOf(activeTab, cursor);

  if (windowState === undefined || activeTab === undefined) {
    return <div className="h-full" />;
  }

  const handleAddressSubmit = (raw: string) => {
    const url = addressTargetUrl(raw, activeTab);
    if (url === null) return;
    navigateActive(windowId, url);
    setNavCursors(navCursorAfterNavigate(navCursors, activeTab));
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <Toolbar
        tab={activeTab}
        currentUrl={currentUrl}
        caps={navCaps(activeTab, cursor)}
        sidePanelOpen={sidePanelOpen}
        onAddressSubmit={handleAddressSubmit}
        onBack={() => setNavCursors(navCursorAfterBack(navCursors, activeTab, cursor))}
        onForward={() => setNavCursors(navCursorAfterForward(navCursors, activeTab, cursor))}
        onReload={() => setReloadKeys((prev) => reloadKeyBumped(prev, activeTab.id))}
        onToggleSidePanel={toggleSidePanel}
      />
      <TabStrip
        windowId={windowId}
        tabs={windowState.tabs}
        activeTabId={windowState.activeTabId}
        activate={activateTab}
        close={closeTab}
        openHome={openHomeTab}
      />
      <TabPanels
        windowId={windowId}
        warmTabs={warmTabsOf(windowState)}
        activeTabId={windowState.activeTabId}
        navCursors={navCursors}
        reloadKeys={reloadKeys}
      />
    </div>
  );
}
