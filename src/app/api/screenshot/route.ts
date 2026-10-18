import { PROJECTS } from "@/lib/portfolio-data";

// Allow-list derives from the projects data (PROJECTS[].url) at module scope,
// so editing portfolio links updates this route without touching it here.
export const ALLOWED_ORIGINS: ReadonlySet<string> = new Set(
  PROJECTS.flatMap((project) => {
    try {
      return [new URL(project.url).origin];
    } catch {
      return [];
    }
  }),
);

// Two-clause pure check: https protocol + allow-listed origin.
export function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_ORIGINS.has(parsed.origin);
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url || !isAllowedUrl(url)) {
    return Response.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false`,
    );

    if (!res.ok) throw new Error("Screenshot failed");

    const data = await res.json();
    const screenshotUrl: unknown = data?.data?.screenshot?.url;
    if (typeof screenshotUrl !== "string") throw new Error("No screenshot url");

    const image = await fetch(screenshotUrl);
    if (!image.ok) throw new Error("Screenshot bytes fetch failed");

    return new Response(image.body, {
      status: 200,
      headers: {
        "Content-Type": image.headers.get("content-type") ?? "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    // Error bodies never echo internal state (requested url, upstream URLs).
    return Response.json({ error: "screenshot unavailable" }, { status: 502 });
  }
}
