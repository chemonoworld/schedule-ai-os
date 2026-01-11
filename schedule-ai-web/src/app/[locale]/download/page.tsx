import { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Header, Footer } from "@/components";
import { getLatestRelease, formatBytes, formatDate } from "@/lib/github";
import { DownloadContent } from "./DownloadContent";

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    title: t("downloadTitle"),
    description: t("downloadDescription"),
    alternates: {
      canonical: `/${locale}/download`,
      languages: {
        en: "/en/download",
        ko: "/ko/download",
      },
    },
  };
}

function formatAsset(asset: { url: string; size: number } | null) {
  if (!asset) return null;
  return { url: asset.url, formattedSize: formatBytes(asset.size) };
}

export default async function DownloadPage() {
  const release = await getLatestRelease();

  return (
    <div className="min-h-screen bg-white dark:bg-black">
      <Header />
      <main className="pt-32 pb-20 px-6">
        <DownloadContent
          release={
            release
              ? {
                  version: release.version,
                  publishedAt: formatDate(release.publishedAt),
                  macOS: {
                    applesilicon: formatAsset(release.macOS.applesilicon),
                    intel: formatAsset(release.macOS.intel),
                  },
                  windows: {
                    exe: formatAsset(release.windows.exe),
                    msi: formatAsset(release.windows.msi),
                  },
                  linux: {
                    deb: formatAsset(release.linux.deb),
                    appimage: formatAsset(release.linux.appimage),
                    rpm: formatAsset(release.linux.rpm),
                  },
                }
              : null
          }
        />
      </main>
      <Footer />
    </div>
  );
}
