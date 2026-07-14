/**
 * Design Validation Script
 * Scans source files for design token violations.
 *
 * Usage: npx tsx scripts/validate-design.ts
 * Config: --strict  Also flag warnings as errors
 *         --fix     Auto-replace common violations (experimental)
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, extname } from "path";
import {
  THEMES,
  TAILWIND_TOKEN_MAP,
  ALLOWED_INLINE_STYLE_PROPS,
  DYNAMIC_COLOR_CONTEXTS,
  isHardcodedColor,
} from "../lib/design-tokens";

type Severity = "ERROR" | "WARN" | "INFO";

interface Violation {
  file: string;
  line: number;
  column: number;
  severity: Severity;
  message: string;
  suggestion: string;
}

const violations: Violation[] = [];
const SCAN_DIRS = ["src/app", "src/components", "src/hooks", "src/lib", "src/store"];
const IGNORE_PATHS = ["node_modules", ".next", "public"];

const ALLOWED_COLOR_FILES = new Set([
  "globals.css",
  "themes.ts",
  "design-tokens.ts",
  "tailwind.config.ts",
]);

// ── Helpers ──────────────────────────────────────────

function isIgnored(filePath: string): boolean {
  return IGNORE_PATHS.some((p) => filePath.includes(p));
}

function walkDir(dir: string): string[] {
  const files: string[] = [];
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      const full = join(dir, entry);
      if (isIgnored(full)) continue;
      if (statSync(full).isDirectory()) {
        files.push(...walkDir(full));
      } else {
        const ext = extname(full);
        if ([".tsx", ".ts", ".css", ".jsx", ".js"].includes(ext)) {
          files.push(full);
        }
      }
    }
  } catch { }
  return files;
}

function isAllowedColorFile(filePath: string): boolean {
  return ALLOWED_COLOR_FILES.has(filePath.split("\\").pop() || filePath.split("/").pop() || "");
}

// ── Checkers ─────────────────────────────────────────

function checkHardcodedColors(
  content: string,
  filePath: string,
  lines: string[]
): void {
  if (isAllowedColorFile(filePath) || DYNAMIC_COLOR_CONTEXTS.has(filePath.split("\\").pop() || filePath.split("/").pop() || "")) return;

  const colorRegex = /(?<!['"`]var\(--)(?<!['"`])(#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})\b|rgba?\([^)]+\)|hsla?\([^)]+\))/gi;
  const excludePatterns = [
    /['"`]\/\/[^'"]*['"`]/,  // URLs
    /['"`]#[^'"]*['"`]/,      // hash fragments
    /\/\/.*/,                  // line comments
    /\*.*\*/,                  // block comments
  ];

  for (const match of content.matchAll(colorRegex)) {
    const fullContent = match[0];
    const pos = match.index!;

    // Compute line/col
    const before = content.slice(0, pos);
    const line = (before.match(/\n/g) || []).length + 1;
    const lastNewline = before.lastIndexOf("\n");
    const column = pos - lastNewline;

    const lineContent = lines[line - 1];

    // Skip if inside a comment, URL, or allowed context
    if (excludePatterns.some((p) => p.test(lineContent))) continue;
    if (lineContent?.includes("//")) continue;

    const suggestion = getTailwindSuggestion(fullContent);
    violations.push({
      file: filePath,
      line,
      column,
      severity: "ERROR",
      message: `Hardcoded color "${fullContent}" found. Use a design token instead.`,
      suggestion: suggestion || `Replace with a CSS variable from globals.css`,
    });
  }
}

function getTailwindSuggestion(color: string): string {
  const lower = color.toLowerCase();

  // Match against theme values
  for (const theme of Object.values(THEMES)) {
    for (const [token, value] of Object.entries(theme)) {
      if (value.toLowerCase() === lower || value.toLowerCase().includes(lower) || lower.includes(value.toLowerCase())) {
        const cssVar = `var(--${token.replace(/_/g, "-")})`;
        const twClass = Object.entries(TAILWIND_TOKEN_MAP).find(
          ([, v]) => v === cssVar
        )?.[0];
        return twClass
          ? `Use Tailwind class "${twClass}" (maps to ${cssVar})`
          : `Use CSS variable ${cssVar}`;
      }
    }
  }
  return "";
}

function checkInlineStyleViolations(
  content: string,
  filePath: string,
): void {
  if (filePath.endsWith(".css")) return;

  const styleRegex = /style=\{([^}]+)\}/g;
  for (const match of content.matchAll(styleRegex)) {
    const styleContent = match[1];
    const pos = match.index!;
    const before = content.slice(0, pos);
    const line = (before.match(/\n/g) || []).length + 1;

    if (isHardcodedColor(styleContent)) {
      violations.push({
        file: filePath,
        line,
        column: pos - before.lastIndexOf("\n"),
        severity: "ERROR",
        message: `Inline style contains hardcoded color: "${styleContent.slice(0, 60)}"`,
        suggestion: `Use a CSS variable or Tailwind class instead`,
      });
    }

    // Check for non-allowed inline style props
    const propRegex = /(\w+):\s*(['"`][^'"`]+['"`]|\d+)/g;
    for (const propMatch of styleContent.matchAll(propRegex)) {
      const propName = propMatch[1];
      if (
        !ALLOWED_INLINE_STYLE_PROPS.has(propName) &&
        !propName.startsWith("--")
      ) {
        violations.push({
          file: filePath,
          line,
          column: pos - before.lastIndexOf("\n") + propMatch.index!,
          severity: "WARN",
          message: `Non-dynamic inline style prop "${propName}" in "${filePath.split("/").pop()}"`,
          suggestion: `Use a Tailwind class instead of inline style for "${propName}"`,
        });
      }
    }
  }
}

function checkTailwindTokenUsage(
  content: string,
  filePath: string,
): void {
  if (filePath.endsWith(".css") || filePath.endsWith(".json")) return;
  const lines = content.split("\n");

  // Check for common non-token Tailwind classes that have token equivalents
  const nonTokenPatterns: [RegExp, string, string][] = [
    [/bg-(red|blue|green|yellow|purple|pink|indigo|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|violet|fuchsia|rose)-\d{2,3}/g, "Use bg-os-bg, bg-os-surface, or bg-os-accent instead of hardcoded Tailwind colors", "WARN"],
    [/text-(red|blue|green|yellow|purple|pink|indigo|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|violet|fuchsia|rose)-\d{2,3}/g, "Use text-os-text or text-os-muted instead of hardcoded Tailwind text colors", "WARN"],
    [/rounded-(none|sm|md|lg|xl|2xl|3xl|full)/g, "Use rounded-os (maps to theme radius) instead of hardcoded rounded-*", "WARN"],
    [/shadow-(sm|md|lg|xl|2xl|inner|none)/g, "Use shadow-os (maps to theme shadow) instead of hardcoded shadow-*", "WARN"],
    [/font-(sans|serif|mono)/g, "Use font-display or font-body (maps to theme fonts) instead of hardcoded font-*", "WARN"],
    [/border-(red|blue|green|yellow|purple|pink|indigo|gray|slate|zinc|neutral|stone|orange|amber|lime|emerald|teal|cyan|sky|violet|fuchsia|rose)-\d{2,3}/g, "Use border-os (maps to theme border color) instead of hardcoded border-*", "WARN"],
  ];

  for (const [regex, msg, severity] of nonTokenPatterns) {
    for (const match of content.matchAll(regex)) {
      const pos = match.index!;
      const before = content.slice(0, pos);
      const line = (before.match(/\n/g) || []).length + 1;
      const lineContent = lines[line - 1];

      // Skip if inside a className string
      if (!lineContent?.includes("className")) continue;

      violations.push({
        file: filePath,
        line,
        column: pos - before.lastIndexOf("\n"),
        severity: severity as Severity,
        message: `Non-token class "${match[0]}" used`,
        suggestion: msg,
      });
    }
  }
}

function checkFontUsage(
  content: string,
  filePath: string,
): void {
  if (isAllowedColorFile(filePath)) return;

  const fontFamilyRegex = /fontFamily:\s*['"`][^'"`]+['"`]/g;
  for (const match of content.matchAll(fontFamilyRegex)) {
    const pos = match.index!;
    const before = content.slice(0, pos);
    const line = (before.match(/\n/g) || []).length + 1;

    violations.push({
      file: filePath,
      line,
      column: pos - before.lastIndexOf("\n"),
      severity: "ERROR",
      message: `Hardcoded fontFamily "${match[0]}" found`,
      suggestion: `Use CSS variable var(--font-display) or var(--font-body) instead`,
    });
  }
}

// ── Main ─────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const rootDir = join(__dirname, "..");

  console.log("\n🔍 Portfolio Design Validator\n");
  console.log(`Scanning: ${SCAN_DIRS.join(", ")}`);

  const files = SCAN_DIRS.flatMap((dir) => walkDir(join(rootDir, dir)));
  console.log(`Found ${files.length} files to check\n`);

  for (const file of files) {
    const content = readFileSync(file, "utf-8");
    const lines = content.split("\n");

    checkHardcodedColors(content, file, lines);
    checkInlineStyleViolations(content, file);
    checkTailwindTokenUsage(content, file);
    checkFontUsage(content, file);
  }

  // ── Report ──────────────────────────────────────────
  const errors = violations.filter((v) => v.severity === "ERROR");
  const warnings = violations.filter((v) => v.severity === "WARN");
  const infos = violations.filter((v) => v.severity === "INFO");

  const failOn = strict ? violations : errors;

  if (violations.length === 0) {
    console.log("✅ No design violations found.\n");
    return;
  }

  for (const v of violations) {
    const icon = v.severity === "ERROR" ? "❌" : v.severity === "WARN" ? "⚠️" : "ℹ️";
    console.log(
      `${icon} [${v.severity}] ${v.file}:${v.line}:${v.column}`
    );
    console.log(`   ${v.message}`);
    console.log(`   💡 ${v.suggestion}\n`);
  }

  console.log(
    `\nSummary: ${errors.length} errors, ${warnings.length} warnings, ${infos.length} infos`
  );

  if (failOn.length > 0) {
    console.log(`\n❌ Validation failed — ${failOn.length} issue(s) to fix.\n`);
    process.exit(1);
  } else {
    console.log("\n✅ No blocking issues found.\n");
  }
}

main();
