"use client";

import { useState, useEffect } from "react";
import { CloudSun, Loader2 } from "lucide-react";

interface WeatherData {
  temperature: number;
  humidity: number;
  weatherCode: number;
}

function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 3) return "⛅";
  if (code <= 48) return "🌫️";
  if (code <= 57) return "🌧️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "🌨️";
  if (code <= 82) return "🌦️";
  return "☁️";
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchWeather() {
      try {
        const res = await fetch("/api/weather");
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        if (cancelled) return;
        setWeather({
          temperature: Math.round(data.current?.temperature_2m ?? 0),
          humidity: data.current?.relative_humidity_2m ?? 0,
          weatherCode: data.current?.weather_code ?? 0,
        });
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchWeather();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-2">
        <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-secondary)" }} />
      </div>
    );
  }

  if (!weather) {
    return (
      <div
        className="flex items-center gap-2 text-[10px]"
        style={{ color: "var(--text-secondary)" }}
      >
        <CloudSun size={14} />
        Weather unavailable
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <span className="text-lg">{weatherEmoji(weather.weatherCode)}</span>
      <div className="flex flex-col">
        <span className="font-display text-sm">{weather.temperature}°C</span>
        <span className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
          Humidity {weather.humidity}%
        </span>
      </div>
    </div>
  );
}
