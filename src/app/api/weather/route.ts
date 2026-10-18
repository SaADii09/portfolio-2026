// Anchored per-value: whole match required, so `12abc`, `1.2.3`, and empty
// strings fall back to the defaults instead of being partial-parsed.
const COORD_PATTERN = /^-?\d{1,3}(\.\d{1,6})?$/;

const DEFAULT_LAT = 30.18;
const DEFAULT_LON = 71.55;

function parseCoord(value: string | null, fallback: number): number {
  if (!value || !COORD_PATTERN.test(value)) return fallback;
  return Number(value);
}

export function parseCoords(params: URLSearchParams): { lat: number; lon: number } {
  return {
    lat: parseCoord(params.get("lat"), DEFAULT_LAT),
    lon: parseCoord(params.get("lon"), DEFAULT_LON),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const { lat, lon } = parseCoords(searchParams);

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`,
      // Static caching must ride on the fetch init: this route is dynamic, so
      // an `export const revalidate` would be a silent no-op.
      { next: { revalidate: 900 } },
    );

    if (!res.ok) {
      return Response.json({ error: "Weather fetch failed" }, { status: res.status });
    }

    const data = await res.json();
    return Response.json(data);
  } catch {
    return Response.json({ error: "Weather service unavailable" }, { status: 502 });
  }
}
