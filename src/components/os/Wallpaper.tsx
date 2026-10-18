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
  depth: number;
}

function createNoiseTexture(w: number, h: number): ImageData | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random() * 255;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 10;
  }
  return img;
}

const COLORS: Record<string, string[]> = {
  retro: ["#ff9f1c", "#ffcc00", "#00e5ff", "#ff69b4"],
};
const DEFAULT_PALETTE: string[] = COLORS.retro ?? [];

const PARTICLE_BASE_COUNTS: Record<string, { far: number; near: number }> = {
  retro: { far: 25, near: 25 },
  neon: { far: 30, near: 30 },
  editorial: { far: 28, near: 27 },
};

const FALLBACK_COUNTS = PARTICLE_BASE_COUNTS.retro ?? { far: 25, near: 25 };

/** Max particles per layer, scaled to viewport width (floored at 0.5x, capped at 1x of a 1440px-wide reference). */
export function countParticles(theme: string, vw: number): { far: number; near: number } {
  const base = PARTICLE_BASE_COUNTS[theme] || PARTICLE_BASE_COUNTS.retro || FALLBACK_COUNTS;
  const scale = Math.max(0.5, Math.min(1, vw / 1440));
  return {
    far: Math.round(base.far * scale),
    near: Math.round(base.near * scale),
  };
}

/** Animation runs only when the user has not requested reduced motion. */
export function shouldAnimate(reduceMotion: boolean): boolean {
  return !reduceMotion;
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

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animate = shouldAnimate(mediaQuery.matches);
    let w = window.innerWidth;
    let h = window.innerHeight;
    // HiDPI: render at device resolution, capped at 2x to bound the buffer cost
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let mouseX = w / 2;
    let mouseY = h / 2;

    let noiseTexture = createNoiseTexture(w * dpr, h * dpr);
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;

    const handleResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Debounce the expensive noise-texture regeneration; geometry updates above stay immediate
      if (resizeTimer !== undefined) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = undefined;
        noiseTexture = createNoiseTexture(w * dpr, h * dpr);
        if (!animate) draw(); // reduced motion: repaint the static frame on the new geometry
      }, 150);
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };

    // Resize is tracked in BOTH modes — the geometry update is cheap, so even
    // reduced-motion users get a correctly sized/repainted static frame.
    window.addEventListener("resize", handleResize);

    const particles: Particle[] = [];
    const { far: FAR_MAX, near: NEAR_MAX } = countParticles(theme, window.innerWidth);

    const colors: Record<string, string[]> = {
      retro: ["#ff9f1c", "#ffcc00", "#00e5ff", "#ff69b4"],
      neon: ["#00f5ff", "#ff00ff", "#39ff14", "#a855f7"],
      editorial: ["#f7a501", "#1a1a1a", "#cd4239", "#1d4ed8"],
    };

    const palette = colors[theme] || colors.retro || DEFAULT_PALETTE;

    // Far layer particles (small, slow, low alpha)
    for (let i = 0; i < FAR_MAX; i++) {
      const isEditorial = theme === "editorial";
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.25,
        vy: theme === "retro" ? -(Math.random() * 0.15 + 0.05) : (Math.random() - 0.5) * 0.15,
        size: isEditorial ? Math.random() * 3 + 1 : Math.random() * 2 + 0.5,
        alpha: isEditorial ? Math.random() * 0.25 + 0.2 : Math.random() * 0.15 + 0.05,
        life: 0,
        maxLife: Math.random() * 400 + 300,
        depth: 0.3,
      });
    }

    // Near layer particles (current behavior)
    for (let i = 0; i < NEAR_MAX; i++) {
      const isEditorial = theme === "editorial";
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.55,
        vy: theme === "retro" ? -(Math.random() * 0.33 + 0.11) : (Math.random() - 0.5) * 0.33,
        size: isEditorial ? Math.random() * 5 + 2 : Math.random() * 4 + 1,
        alpha: isEditorial ? Math.random() * 0.4 + 0.5 : Math.random() * 0.4 + 0.1,
        life: 0,
        maxLife: Math.random() * 300 + 200,
        depth: 1,
      });
    }

    let frame = 0;

    const draw = () => {
      frame++;
      ctx.clearRect(0, 0, w, h);

      // Neon grid
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

        // Grid intersection glow near mouse
        const glowRadius = 120;
        for (let x = offset; x < w; x += step) {
          for (let y = offset; y < h; y += step) {
            const dx = x - mouseX;
            const dy = y - mouseY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < glowRadius) {
              const intensity = 1 - dist / glowRadius;
              ctx.fillStyle = `rgba(0, 245, 255, ${intensity * 0.15})`;
              ctx.beginPath();
              ctx.arc(x, y, 3 + intensity * 4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      } else if (theme === "editorial") {
        ctx.strokeStyle = "rgba(35, 37, 29, 0.06)";
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 40) {
          const dx = Math.sin((y + frame * 0.1) * 0.01) * 20;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.quadraticCurveTo(w / 2 + dx, y - 10, w, y);
          ctx.stroke();
        }
      }

      // Mouse spotlight gradient
      const spotlight = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, 200);
      if (theme === "neon") {
        spotlight.addColorStop(0, "rgba(0, 245, 255, 0.03)");
      } else if (theme === "retro") {
        spotlight.addColorStop(0, "rgba(255, 159, 28, 0.02)");
      } else {
        spotlight.addColorStop(0, "rgba(247, 165, 1, 0.02)");
      }
      spotlight.addColorStop(1, "transparent");
      ctx.fillStyle = spotlight;
      ctx.fillRect(0, 0, w, h);

      // Update and draw particles
      particles.forEach((p, i) => {
        p.life++;
        if (p.life > p.maxLife) {
          particles[i] = {
            x: Math.random() * w,
            y: theme === "retro" ? h + 10 : Math.random() * h,
            vx: (Math.random() - 0.5) * (p.depth < 0.5 ? 0.25 : 0.55),
            vy:
              theme === "retro"
                ? -(Math.random() * (p.depth < 0.5 ? 0.15 : 0.33) + 0.05)
                : (Math.random() - 0.5) * (p.depth < 0.5 ? 0.15 : 0.33),
            size:
              theme === "editorial"
                ? Math.random() * (p.depth < 0.5 ? 3 : 5) + (p.depth < 0.5 ? 1 : 2)
                : Math.random() * (p.depth < 0.5 ? 2 : 4) + (p.depth < 0.5 ? 0.5 : 1),
            alpha:
              theme === "editorial"
                ? Math.random() * (p.depth < 0.5 ? 0.25 : 0.4) + (p.depth < 0.5 ? 0.2 : 0.5)
                : Math.random() * (p.depth < 0.5 ? 0.15 : 0.4) + (p.depth < 0.5 ? 0.05 : 0.1),
            life: 0,
            maxLife: Math.random() * (p.depth < 0.5 ? 400 : 300) + (p.depth < 0.5 ? 300 : 200),
            depth: p.depth,
          };
          return;
        }

        // Mouse influence — subtle attraction/repulsion
        const dx = mouseX - p.x;
        const dy = mouseY - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 200 && dist > 10) {
          const force = (1 - dist / 200) * 0.08 * p.depth;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }

        // Dampen velocity
        p.vx *= 0.99;
        p.vy *= 0.99;

        p.x += p.vx;
        p.y += p.vy;

        const color = palette[i % palette.length] ?? palette[0];
        if (color === undefined) return; // empty palette — nothing to draw
        ctx.globalAlpha = p.alpha * (1 - p.life / p.maxLife) * p.depth;
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
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      ctx.globalAlpha = 1;

      // Noise grain overlay
      if (noiseTexture) {
        ctx.putImageData(noiseTexture, 0, 0);
      }

      if (animate) {
        animRef.current = requestAnimationFrame(draw);
      }
    };

    // Tear down whatever mode is running, then (re)enter the mode the current
    // reduced-motion preference asks for. Used at mount and on preference flips.
    const applyMotionMode = () => {
      animate = shouldAnimate(mediaQuery.matches);
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("mousemove", handleMouseMove);
      if (animate) {
        window.addEventListener("mousemove", handleMouseMove);
        animRef.current = requestAnimationFrame(draw); // animation loop
      } else {
        draw(); // reduced motion: freeze on a single static frame
      }
    };
    mediaQuery.addEventListener("change", applyMotionMode);
    applyMotionMode();

    return () => {
      cancelAnimationFrame(animRef.current);
      if (resizeTimer !== undefined) clearTimeout(resizeTimer);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
      mediaQuery.removeEventListener("change", applyMotionMode);
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
