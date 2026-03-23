import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { Analytics } from "@vercel/analytics/next";
import FeedbackButton from "@/components/FeedbackButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CineBret — Buscador y recomendador de películas",
  description: "Descubre, recomienda y comparte las mejores películas disponibles en streaming en Chile. Recomendaciones personalizadas, reviews y comunidad cinéfila.",
  metadataBase: new URL("https://cinebret.cl"),
  openGraph: {
    title: "CineBret — Buscador y recomendador de películas",
    description: "Descubre, recomienda y comparte las mejores películas disponibles en streaming en Chile.",
    url: "https://cinebret.cl",
    siteName: "CineBret",
    type: "website",
    images: [{ url: "/logo-oficial.png" }],
  },
  twitter: {
    card: "summary",
    title: "CineBret",
    description: "Buscador y recomendador inteligente de películas en streaming",
  },
  icons: {
    icon: "/logo-pequeno.png",
    apple: "/logo-pequeno.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden bg-zinc-950">
        <AuthProvider>
          {children}
          <FeedbackButton />
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
