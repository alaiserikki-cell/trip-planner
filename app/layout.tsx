import type { Metadata, Viewport } from "next";
import { DM_Sans, Playfair_Display } from "next/font/google";
import "./globals.css";

const display = Playfair_Display({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"], style: ["normal", "italic"] });
const body = DM_Sans({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Plan it — the group trip decider",
  description: "Stop debating in the group chat. Everyone answers privately, you get three trips that work for the whole group, and you lock one.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#faf8f5",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
