export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get("lat") || "30.18";
  const lon = searchParams.get("lon") || "71.55";

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&timezone=auto`,
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
