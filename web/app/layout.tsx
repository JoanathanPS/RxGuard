import type { Metadata } from "next";
import type LayoutProps from "next";
import localFont from "next/font/local";
import "./globals.css";

const jetbrainsMono = localFont({
  src: [
    {
      path: "../fonts/JetBrainsMono-Variable.ttf",
      style: "normal",
    },
    {
      path: "../fonts/JetBrainsMono-VariableItalic.ttf",
      style: "italic",
    },
  ],
  variable: "--font-jbm",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "RxGuard",
    template: "%s · RxGuard",
  },
  description:
    "AI-assisted drug interaction check. Research/educational capstone — not a certified medical device.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}