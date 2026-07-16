import type { Metadata, Viewport } from "next";
import { Press_Start_2P, VT323, Orbitron, Rajdhani, IBM_Plex_Sans } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
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

const ibmPlexSans = IBM_Plex_Sans({
  variable: "--font-ibm-plex-sans",
  weight: ["400", "500", "600", "700"],
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
      className={`${pressStart2p.variable} ${vt323.variable} ${orbitron.variable} ${rajdhani.variable} ${ibmPlexSans.variable}`}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
