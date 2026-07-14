"use client";

import { useState, useEffect } from "react";

export function ClockWidget() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      );
      setDate(now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="font-display text-lg tracking-wider">{time}</span>
      <span style={{ color: "var(--text-secondary)" }} className="text-[10px] font-body">
        {date}
      </span>
    </div>
  );
}
