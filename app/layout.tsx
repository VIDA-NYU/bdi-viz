import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import ToastProvider from "@/app/lib/toastify/toastify-provider";
import SettingsGlobalProvider from "./lib/settings/settings-provider";
import HighlightGlobalProvider from "./lib/highlight/highlight-provider";
import PaginationGlobalProvider from "./lib/pagination/pagination-provider";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  icons: {
    icon: [
      { url: "/favicon.ico" },
    ],
  },
  title: "BDIViz",
  description: "BDIViz is a heatmap visualization tool designed for biomedical data harmonization.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>
          <SettingsGlobalProvider>
            <HighlightGlobalProvider>
              <PaginationGlobalProvider>
                {children}
              </PaginationGlobalProvider>
            </HighlightGlobalProvider>
          </SettingsGlobalProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
