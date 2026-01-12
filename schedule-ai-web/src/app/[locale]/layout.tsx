import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import "../globals.css";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Schedule AI",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "macOS",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  description:
    "AI-powered schedule management app designed for ADHD. Features include focus mode with app blocking, AI-powered task parsing, and visual progress tracking.",
  featureList: [
    "AI-powered task parsing with Claude",
    "Focus mode with app blocking",
    "Pomodoro timer",
    "GitHub-style progress heatmap",
    "Recurring task automation",
    "Multi-language support",
  ],
  screenshot: "https://schedule-ai.app/screenshots/today-main.png",
  softwareVersion: "1.0.0",
  author: {
    "@type": "Organization",
    name: "Schedule AI Team",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

type Props = {
  params: Promise<{ locale: string }>;
};

const baseUrl = "https://schedule-ai.app";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: t("title"),
      template: `%s | Schedule AI`,
    },
    description: t("description"),
    keywords: [
      "ADHD",
      "schedule",
      "AI",
      "productivity",
      "focus mode",
      "task management",
      "pomodoro",
      "app blocker",
      "time management",
      "Claude AI",
    ],
    authors: [{ name: "Schedule AI Team" }],
    creator: "Schedule AI",
    publisher: "Schedule AI",
    openGraph: {
      title: "Schedule AI - ADHD-Focused Task Management",
      description: t("description"),
      type: "website",
      locale: locale,
      url: `${baseUrl}/${locale}`,
      siteName: "Schedule AI",
      images: [
        {
          url: "/og-image.png",
          width: 1200,
          height: 630,
          alt: "Schedule AI - AI-Powered Schedule Management for ADHD",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Schedule AI - ADHD-Focused Task Management",
      description: t("description"),
      images: ["/og-image.png"],
    },
    alternates: {
      canonical: `${baseUrl}/${locale}`,
      languages: {
        en: `${baseUrl}/en`,
        ko: `${baseUrl}/ko`,
      },
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  // Validate locale
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }

  const messages = await getMessages();

  return (
    <html lang={locale}>
      <head>
        <Script
          id="json-ld"
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
