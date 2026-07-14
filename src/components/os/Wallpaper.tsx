"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export function Wallpaper() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useStore((s) => s.theme);
  const animRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = window.innerWidth;
    let h = window.innerHeight;
    canvas.width = w;
    canvas.height = h;

    const handleResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
    };
    window.addEventListener("resize", handleResize);

    const particles: Particle[] = [];
    const MAX = theme === "neon" ? 60 : 40;

    const colors: Record<string, string[]> = {
      retro: ["#ff9f1c", "#ffbf00", "#2ec4b6", "#d4a373"],
      neon: ["#00f5ff", "#ff00ff", "#39ff14", "#a855f7"],
      editorial: ["#1a1a1a", "#8b4513", "#2f4f4f", "#d4cfc7"],
    };

    const palette = colors[theme] || colors.retro;

    for (let i = 0; i < MAX; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.5,
        vy: theme === "retro" ? -(Math.random() * 0.3 + 0.1) : (Math.random() - 0.5) * 0.3,
        size: Math.random() * 4 + 1,
        alpha: Math.random() * 0.4 + 0.1,
        life: 0,
        maxLife: Math.random() * 300 + 200,
      });
    }

    let frame = 0;

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);

      if (theme === "neon") {
        ctx.strokeStyle = "rgba(0, 245, 255, 0.03)";
        ctx.lineWidth = 1;
        const step = 60;
        const offset = (frame * 0.2) % step;
        for (let x = offset; x < w; x += step) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
        }
        for (let y = offset; y < h; y += step) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
      } else if (theme === "editorial") {
        ctx.strokeStyle = "rgba(26, 26, 26, 0.02)";
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 40) {
          const dx = Math.sin((y + frame * 0.1) * 0.01) * 20;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.quadraticCurveTo(w / 2 + dx, y - 10, w, y);
          ctx.stroke();
        }
      }

      particles.forEach((p, i) => {
        p.life++;
        if (p.life > p.maxLife) {
          particles[i] = {
            x: Math.random() * w,
            y: theme === "retro" ? h + 10 : Math.random() * h,
            vx: (Math.random() - 0.5) * 0.5,
            vy: theme === "retro" ? -(Math.random() * 0.3 + 0.1) : (Math.random() - 0.5) * 0.3,
            size: Math.random() * 4 + 1,
            alpha: Math.random() * 0.4 + 0.1,
            life: 0,
            maxLife: Math.random() * 300 + 200,
          };
          return;
        }

        p.x += p.vx;
        p.y += p.vy;

        const color = palette[i % palette.length];
        ctx.globalAlpha = p.alpha * (1 - p.life / p.maxLife);
        ctx.fillStyle = color;
        ctx.beginPath();

        if (theme === "retro") {
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (theme === "neon") {
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
          glow.addColorStop(0, color);
          glow.addColorStop(1, "transparent");
          ctx.fillStyle = glow;
          ctx.fillRect(p.x - p.size * 3, p.y - p.size * 3, p.size * 6, p.size * 6);
        } else {
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.globalAlpha = 1;
      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
