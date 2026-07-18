import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  return {
    metadataBase: new URL(origin),
    title: "研价 · 调研报价助手",
    description: "面向市场调研与用户研究团队的本地优先智能报价工具。",
    applicationName: "研价",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "研价" },
    icons: { icon: "/favicon.svg", apple: "/favicon.svg" },
    openGraph: { title: "研价 · 调研报价助手", description: "本地优先 · 隐私优先 · 规则计算", images: [{ url: `${origin}/og.png`, width: 1736, height: 907 }] },
    twitter: { card: "summary_large_image", title: "研价 · 调研报价助手", description: "本地优先 · 隐私优先 · 规则计算", images: [`${origin}/og.png`] },
  };
}

export const viewport: Viewport = {
  themeColor: "#4969f5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
