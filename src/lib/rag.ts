import fs from "fs";
import path from "path";

interface Chunk {
  text: string;
  index: number;
}

let cachedChunks: Chunk[] | null = null;

function loadKnowledgeBase(): string {
  const filePath = path.join(process.cwd(), "data", "portfolio-knowledge.md");
  return fs.readFileSync(filePath, "utf-8");
}

function chunkText(text: string): Chunk[] {
  const lines = text.split("\n");
  const chunks: Chunk[] = [];
  let current: string[] = [];
  let index = 0;

  for (const line of lines) {
    if (line.startsWith("## ") && current.length > 0) {
      chunks.push({ text: current.join("\n").trim(), index });
      index++;
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) {
    chunks.push({ text: current.join("\n").trim(), index });
  }

  return chunks;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(Boolean);
}

function scoreChunk(chunk: string, queryTerms: string[]): number {
  const chunkTokens = tokenize(chunk);
  const chunkSet = new Set(chunkTokens);
  let score = 0;

  for (const term of queryTerms) {
    if (chunkSet.has(term)) {
      score += 1;
      const freq = chunkTokens.filter((t) => t === term).length;
      score += freq * 0.5;
    }
    if (chunk.toLowerCase().includes(term)) {
      score += 0.25;
    }
  }

  return score;
}

export function retrieveRelevantContext(query: string, topK = 4): string {
  if (!cachedChunks) {
    const raw = loadKnowledgeBase();
    cachedChunks = chunkText(raw);
  }

  const queryTerms = tokenize(query);
  if (queryTerms.length === 0) return "";

  const scored = cachedChunks
    .map((chunk) => ({
      chunk,
      score: scoreChunk(chunk.text, queryTerms),
    }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (scored.length === 0) return "";

  return scored.map((c) => c.chunk.text).join("\n\n---\n\n");
}

export function resetKnowledgeCache(): void {
  cachedChunks = null;
}
