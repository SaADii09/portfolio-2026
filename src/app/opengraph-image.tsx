import { ImageResponse } from "next/og";

/**
 * Generated OpenGraph card (1200×630), drawn with the built-in `next/og`
 * renderer — no external font fetch, system font stack only.
 *
 * NOTE: the colors below are deliberately literal. This file is not a themed
 * surface (it has no CSS cascade and no theme context), so it is the one
 * documented exception to the design-token rule. The palette mirrors the
 * retro theme so the card matches the portfolio's default look.
 */
const retro = {
  ground: "#1a0f0a",
  groundTop: "#2d1b14",
  window: "#241510",
  surface: "#4a3728",
  line: "#6b5344",
  accent1: "#ff9f1c",
  accent2: "#ffbf00",
  accent3: "#2ec4b6",
  text: "#fff8e7",
  textMuted: "#d4a373",
} as const;

const scanlineCount = 54;

export const alt = "DevOS — Interactive Web OS portfolio by Saad Ahmad";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: "60px 72px 54px",
        backgroundColor: retro.ground,
        backgroundImage: `linear-gradient(135deg, ${retro.groundTop} 0%, ${retro.ground} 52%, #0d0705 100%)`,
        color: retro.text,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      }}
    >
      {/* scanline motif */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
        }}
      >
        {Array.from({ length: scanlineCount }, (_, i) => (
          <div
            key={i}
            style={{ width: "100%", height: 1, backgroundColor: "rgba(255, 248, 231, 0.05)" }}
          />
        ))}
      </div>

      {/* ambient glow behind the wordmark */}
      <div
        style={{
          position: "absolute",
          top: 168,
          left: 0,
          display: "flex",
          width: 780,
          height: 300,
          backgroundImage:
            "linear-gradient(90deg, rgba(255, 159, 28, 0.14) 0%, rgba(255, 159, 28, 0) 100%)",
        }}
      />

      {/* accent bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          display: "flex",
          width: "100%",
          height: 12,
        }}
      >
        <div style={{ flex: 1, backgroundColor: retro.accent1 }} />
        <div style={{ flex: 1, backgroundColor: retro.accent2 }} />
        <div style={{ flex: 1, backgroundColor: retro.accent3 }} />
      </div>

      {/* prompt motif */}
      <div style={{ display: "flex", alignItems: "center", fontSize: 30 }}>
        <span style={{ color: retro.accent3 }}>~/devos</span>
        <span style={{ margin: "0 14px", color: retro.accent1 }}>$</span>
        <div style={{ width: 18, height: 32, backgroundColor: retro.accent1 }} />
      </div>

      {/* wordmark + tagline + mini window */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: 640 }}>
          <div style={{ display: "flex", fontSize: 140, letterSpacing: 2, lineHeight: 1 }}>
            <span>Dev</span>
            <span style={{ color: retro.accent1 }}>OS</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: 28,
              fontSize: 30,
              lineHeight: 1.45,
              color: retro.textMuted,
            }}
          >
            <span>Interactive Web OS portfolio —</span>
            <span>full-stack & AI engineering</span>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 356,
            border: `3px solid ${retro.accent1}`,
            backgroundColor: retro.window,
            boxShadow: `10px 10px 0 #0d0705`,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 44,
              padding: "0 16px",
              backgroundColor: retro.accent1,
            }}
          >
            <div style={{ width: 11, height: 11, marginRight: 8, backgroundColor: retro.ground }} />
            <div style={{ width: 11, height: 11, marginRight: 8, backgroundColor: retro.ground }} />
            <div
              style={{ width: 11, height: 11, marginRight: 16, backgroundColor: retro.ground }}
            />
            <span style={{ fontSize: 17, fontWeight: 600, color: retro.ground }}>Projects</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", padding: "24px 20px" }}>
            <div
              style={{ width: 212, height: 11, marginBottom: 14, backgroundColor: retro.surface }}
            />
            <div
              style={{ width: 150, height: 11, marginBottom: 14, backgroundColor: retro.line }}
            />
            <div
              style={{ width: 184, height: 11, marginBottom: 24, backgroundColor: retro.surface }}
            />
            <span style={{ fontSize: 16, color: retro.accent3 }}>~/devos $ npm run dev</span>
          </div>
        </div>
      </div>

      {/* footer */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
        }}
      >
        <span style={{ fontSize: 24, color: retro.textMuted }}>Saad Ahmad</span>
        <div style={{ display: "flex", alignItems: "center" }}>
          {[retro.accent1, retro.accent2, retro.accent3].map((color) => (
            <div
              key={color}
              style={{ width: 14, height: 14, marginLeft: 10, backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>,
    { ...size },
  );
}
