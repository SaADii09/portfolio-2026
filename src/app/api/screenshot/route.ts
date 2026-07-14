export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");

  if (!url) {
    return Response.json({ error: "Missing url param" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.microlink.io/?url=${encodeURIComponent(url)}&screenshot=true&meta=false`,
    );

    if (!res.ok) throw new Error("Screenshot failed");

    const data = await res.json();
    return Response.json({ screenshot: data.data?.screenshot?.url ?? null });
  } catch {
    return Response.json({ screenshot: null, error: "Screenshot unavailable" }, { status: 502 });
  }
}
