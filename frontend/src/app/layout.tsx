import type { Metadata } from "next";
import Script from "next/script";
import { Fraunces, Manrope } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font — no extra npm dependency, no
// runtime request to Google's CDN, and text stays visible while it loads.
// Fraunces is the "expensive editorial" serif doing the heavy lifting on
// identity; Manrope is a geometric sans with a bit more character than the
// Inter-everywhere look, kept purely for body/UI text so it never competes.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-fraunces",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EduNexus",
  description: "School management platform",
  icons: {
    icon: "/favicon.png",
  },
};

// Runs before paint so switching editions never flashes the wrong palette.
const THEME_INIT = `
(function () {
  try {
    var stored = window.localStorage.getItem("edusync:theme");
    var dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${fraunces.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col bg-paper text-ink">
        {children}
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
