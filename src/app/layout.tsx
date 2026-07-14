import type { Metadata, Viewport } from "next";
import { Press_Start_2P, VT323, Orbitron, Rajdhani, Crimson_Pro, Inter } from "next/font/google";
import "./globals.css";

const pressStart2p = Press_Start_2P({
  variable: "--font-press-start-2p",
  weight: "400",
  subsets: ["latin"],
});

const vt323 = VT323({
  variable: "--font-vt323",
  weight: "400",
  subsets: ["latin"],
});

const orbitron = Orbitron({
  variable: "--font-orbitron",
  subsets: ["latin"],
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  weight: ["400", "500", "600"],
  subsets: ["latin"],
});

const crimsonPro = Crimson_Pro({
  variable: "--font-crimson-pro",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "DevOS Portfolio — Saad Ahmad",
  description: "Interactive Web OS portfolio showcasing full-stack and AI engineering work.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="retro"
      className={`${pressStart2p.variable} ${vt323.variable} ${orbitron.variable} ${rajdhani.variable} ${crimsonPro.variable} ${inter.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
