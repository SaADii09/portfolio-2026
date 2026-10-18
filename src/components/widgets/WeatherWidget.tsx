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

interface WeatherCurrent {
  temperature_2m?: number;
  relative_humidity_2m?: number;
  weather_code?: number;
}

function toWeatherData(current: WeatherCurrent): WeatherData {
  return {
    temperature: Math.round(current.temperature_2m ?? 0),
    humidity: current.relative_humidity_2m ?? 0,
    weatherCode: current.weather_code ?? 0,
  };
}

/**
 * One API round-trip. Throws on transport/HTTP failure so callers can route
 * through `.catch` — keeps this function branch-free apart from `!res.ok`.
 */
async function loadWeather(): Promise<WeatherData> {
  const res = await fetch("/api/weather");
  if (!res.ok) throw new Error("Failed");
  const data = await res.json();
  return toWeatherData(data.current);
}

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const isCurrent = () => !cancelled;

    setLoading(true);
    loadWeather()
      .catch(() => null) // failure state is simply "no data"
      .then((result) => {
        if (isCurrent()) {
          setWeather(result);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => setAttempt((n) => n + 1);

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
        <span>Weather unavailable</span>
        <button
          onClick={retry}
          aria-label="Retry"
          className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0 flex items-center rounded-os underline decoration-dotted underline-offset-2 transition-opacity hover:opacity-70"
        >
          Retry
        </button>
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
