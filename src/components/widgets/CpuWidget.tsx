"use client";

import { useState, useEffect } from "react";

export function CpuWidget() {
  const [usage, setUsage] = useState(0);

  useEffect(() => {
    const tick = () => {
      setUsage(Math.round(15 + Math.random() * 55));
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-body" style={{ color: "var(--text-secondary)" }}>
          CPU Usage
        </span>
        <span className="font-display text-xs">{usage}%</span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--bg-tertiary)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${usage}%`,
            background: "var(--accent-2)",
          }}
        />
      </div>
    </div>
  );
}
