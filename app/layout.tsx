import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Analytics } from "@vercel/analytics/next";
import FeedbackButton from "@/components/FeedbackButton";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CineBret — Control Remoto de Streaming",
  description: "Buscador y recomendador de películas y series en streaming en Chile. Recomendaciones personalizadas, reviews y comunidad cinéfila.",
  metadataBase: new URL("https://cinebret.cl"),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CineBret",
    startupImage: "/icons/icon-512x512.png",
  },
  openGraph: {
    title: "CineBret — Control Remoto de Streaming",
    description: "Descubre, recomienda y comparte las mejores películas disponibles en streaming en Chile.",
    url: "https://cinebret.cl",
    siteName: "CineBret",
    type: "website",
    images: [{ url: "/logo-oficial.png", width: 1072, height: 960 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CineBret",
    description: "El control remoto universal de streaming en Chile",
    images: ["/logo-oficial.png"],
  },
  icons: {
    icon: [
      { url: "/icons/icon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      { url: "/icons/icon-152x152.png", sizes: "152x152" },
      { url: "/icons/icon-192x192.png", sizes: "192x192" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: '#d4a017',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="min-h-full flex flex-col overflow-x-hidden bg-zinc-950">
        <AuthProvider>
          {children}
          <FeedbackButton />
        </AuthProvider>
        <Analytics />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
