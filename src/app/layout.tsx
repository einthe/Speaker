import type { Metadata, Viewport } from "next";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./globals.css";
import "./palettes.css";
import { paletteInitScript } from "@/lib/palettes";
export const metadata: Metadata = {
  title: { default: "NTNUI Volleyball · D2A", template: "%s | NTNUI D2A" },
  description: "Det private lagrommet for NTNUI Volleyball D2A.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#101411" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nb" data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: paletteInitScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
