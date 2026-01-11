"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { detectPlatform, type Platform } from "@/lib/platform";

interface AssetData {
  url: string;
  formattedSize: string;
}

interface ReleaseData {
  version: string;
  publishedAt: string;
  macOS: {
    applesilicon: AssetData | null;
    intel: AssetData | null;
  };
  windows: {
    exe: AssetData | null;
    msi: AssetData | null;
  };
  linux: {
    deb: AssetData | null;
    appimage: AssetData | null;
    rpm: AssetData | null;
  };
}

type MacArch = "applesilicon" | "intel";

function detectMacArch(): MacArch {
  if (typeof navigator === "undefined") return "applesilicon";

  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl");
    if (gl) {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        if (renderer.includes("Apple M")) return "applesilicon";
        if (renderer.includes("Intel")) return "intel";
      }
    }
  } catch {
    // ignore
  }

  return "applesilicon";
}

export function DownloadContent({ release }: { release: ReleaseData | null }) {
  const t = useTranslations("download");
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [macArch, setMacArch] = useState<MacArch>("applesilicon");

  useEffect(() => {
    setPlatform(detectPlatform());
    setMacArch(detectMacArch());
  }, []);

  const platformOrder: Platform[] =
    platform === "macos"
      ? ["macos", "windows", "linux"]
      : platform === "windows"
        ? ["windows", "macos", "linux"]
        : platform === "linux"
          ? ["linux", "macos", "windows"]
          : ["macos", "windows", "linux"];

  const [primaryPlatform, ...otherPlatforms] = platformOrder;

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-4xl sm:text-5xl font-bold text-zinc-900 dark:text-zinc-100 text-center mb-6">
        {t("title")}
      </h1>
      <p className="text-xl text-zinc-600 dark:text-zinc-400 text-center mb-12">
        {t("subtitle")}
      </p>

      {/* Primary Platform */}
      <PlatformCard
        platform={primaryPlatform}
        release={release}
        macArch={macArch}
        setMacArch={setMacArch}
        isDetected={platform === primaryPlatform}
        t={t}
        isPrimary
      />

      {/* Other Platforms */}
      <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4 mt-12">
        {t("otherPlatforms")}
      </h2>
      <div className="grid md:grid-cols-2 gap-4 mb-12">
        {otherPlatforms.map((p) => (
          <PlatformCard
            key={p}
            platform={p}
            release={release}
            macArch={macArch}
            setMacArch={setMacArch}
            isDetected={false}
            t={t}
          />
        ))}
      </div>

      {/* Installation Instructions */}
      <InstallationGuide platform={primaryPlatform} t={t} />

      {/* Back to Home */}
      <div className="text-center mt-12">
        <Link
          href="/"
          className="text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
        >
          &larr; {t("backHome")}
        </Link>
      </div>
    </div>
  );
}

function PlatformCard({
  platform,
  release,
  macArch,
  setMacArch,
  isDetected,
  t,
  isPrimary = false,
}: {
  platform: Platform;
  release: ReleaseData | null;
  macArch: MacArch;
  setMacArch: (arch: MacArch) => void;
  isDetected: boolean;
  t: ReturnType<typeof useTranslations<"download">>;
  isPrimary?: boolean;
}) {
  const cardClass = isPrimary
    ? "bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-800"
    : "bg-zinc-50 dark:bg-zinc-900 rounded-xl p-6 border border-zinc-200 dark:border-zinc-800";

  if (platform === "macos") {
    return (
      <div className={cardClass}>
        <div className="flex items-start gap-6">
          <div
            className={`${isPrimary ? "w-16 h-16" : "w-12 h-12"} bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0`}
          >
            <AppleIcon className={isPrimary ? "w-8 h-8" : "w-6 h-6"} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2
                className={`${isPrimary ? "text-2xl" : "text-lg"} font-semibold text-zinc-900 dark:text-zinc-100`}
              >
                {t("macos")}
              </h2>
              {isDetected && (
                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-0.5 rounded-full">
                  {t("detected")}
                </span>
              )}
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4">
              {t("macosDesc")}
            </p>

            {release && (release.macOS.applesilicon || release.macOS.intel) ? (
              <div className="space-y-4">
                {isPrimary && release.macOS.applesilicon && release.macOS.intel && (
                  <div className="flex gap-2 mb-4">
                    <ArchButton
                      selected={macArch === "applesilicon"}
                      onClick={() => setMacArch("applesilicon")}
                      label={t("appleSilicon")}
                    />
                    <ArchButton
                      selected={macArch === "intel"}
                      onClick={() => setMacArch("intel")}
                      label={t("intel")}
                    />
                  </div>
                )}

                <DownloadLinks
                  assets={[
                    {
                      label: t("appleSilicon"),
                      asset: release.macOS.applesilicon,
                      selected: macArch === "applesilicon",
                    },
                    {
                      label: t("intel"),
                      asset: release.macOS.intel,
                      selected: macArch === "intel",
                    },
                  ]}
                  version={release.version}
                  publishedAt={release.publishedAt}
                  isPrimary={isPrimary}
                  showSelected={isPrimary}
                  t={t}
                />
              </div>
            ) : (
              <NoReleaseMessage t={t} />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (platform === "windows") {
    return (
      <div className={cardClass}>
        <div className="flex items-start gap-6">
          <div
            className={`${isPrimary ? "w-16 h-16" : "w-12 h-12"} bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center flex-shrink-0`}
          >
            <WindowsIcon className={isPrimary ? "w-8 h-8" : "w-6 h-6"} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2
                className={`${isPrimary ? "text-2xl" : "text-lg"} font-semibold text-zinc-900 dark:text-zinc-100`}
              >
                {t("windows")}
              </h2>
              {isDetected && (
                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-0.5 rounded-full">
                  {t("detected")}
                </span>
              )}
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4">
              {t("windowsDesc")}
            </p>

            {release && (release.windows.exe || release.windows.msi) ? (
              <DownloadLinks
                assets={[
                  { label: t("installer"), asset: release.windows.exe },
                  { label: t("portable"), asset: release.windows.msi },
                ]}
                version={release.version}
                publishedAt={release.publishedAt}
                isPrimary={isPrimary}
                t={t}
              />
            ) : (
              <NoReleaseMessage t={t} />
            )}
          </div>
        </div>
      </div>
    );
  }

  if (platform === "linux") {
    return (
      <div className={cardClass}>
        <div className="flex items-start gap-6">
          <div
            className={`${isPrimary ? "w-16 h-16" : "w-12 h-12"} bg-gradient-to-br from-orange-400 to-yellow-500 rounded-2xl flex items-center justify-center flex-shrink-0`}
          >
            <LinuxIcon className={isPrimary ? "w-8 h-8" : "w-6 h-6"} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <h2
                className={`${isPrimary ? "text-2xl" : "text-lg"} font-semibold text-zinc-900 dark:text-zinc-100`}
              >
                {t("linux")}
              </h2>
              {isDetected && (
                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-2 py-0.5 rounded-full">
                  {t("detected")}
                </span>
              )}
            </div>
            <p className="text-zinc-600 dark:text-zinc-400 text-sm mb-4">
              {t("linuxDesc")}
            </p>

            {release &&
            (release.linux.deb || release.linux.appimage || release.linux.rpm) ? (
              <DownloadLinks
                assets={[
                  { label: t("debPackage"), asset: release.linux.deb },
                  { label: t("appImage"), asset: release.linux.appimage },
                  { label: t("rpmPackage"), asset: release.linux.rpm },
                ]}
                version={release.version}
                publishedAt={release.publishedAt}
                isPrimary={isPrimary}
                t={t}
              />
            ) : (
              <NoReleaseMessage t={t} />
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

function ArchButton({
  selected,
  onClick,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        selected
          ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
          : "bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600"
      }`}
    >
      {label}
    </button>
  );
}

function DownloadLinks({
  assets,
  version,
  publishedAt,
  isPrimary,
  showSelected = false,
  t,
}: {
  assets: { label: string; asset: AssetData | null; selected?: boolean }[];
  version: string;
  publishedAt: string;
  isPrimary: boolean;
  showSelected?: boolean;
  t: ReturnType<typeof useTranslations<"download">>;
}) {
  const availableAssets = assets.filter((a) => a.asset);

  if (availableAssets.length === 0) {
    return <NoReleaseMessage t={t} />;
  }

  // For primary with selection, show only selected
  if (showSelected) {
    const selectedAsset = assets.find((a) => a.selected && a.asset);
    if (selectedAsset && selectedAsset.asset) {
      return (
        <div className="space-y-3">
          <a
            href={selectedAsset.asset.url}
            className="inline-flex items-center justify-center gap-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 py-3 rounded-full font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            <DownloadIcon />
            {t("downloadBtn")} {version}
          </a>
          <div className="flex items-center gap-4 text-sm text-zinc-500">
            <span>{selectedAsset.asset.formattedSize}</span>
            <span>
              {t("released")} {publishedAt}
            </span>
          </div>
        </div>
      );
    }
  }

  // For non-primary or without selection, show all available
  return (
    <div className="space-y-2">
      {availableAssets.map(({ label, asset }) => (
        <a
          key={label}
          href={asset!.url}
          className={`flex items-center justify-between gap-4 ${
            isPrimary
              ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-3 rounded-lg hover:bg-zinc-700 dark:hover:bg-zinc-300"
              : "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 px-3 py-2 rounded-lg hover:bg-zinc-300 dark:hover:bg-zinc-600"
          } transition-colors`}
        >
          <span className="flex items-center gap-2">
            <DownloadIcon />
            <span className="font-medium">{label}</span>
          </span>
          <span className="text-sm opacity-75">{asset!.formattedSize}</span>
        </a>
      ))}
      <div className="text-sm text-zinc-500 mt-2">
        {version} - {t("released")} {publishedAt}
      </div>
    </div>
  );
}

function NoReleaseMessage({
  t,
}: {
  t: ReturnType<typeof useTranslations<"download">>;
}) {
  return (
    <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4">
      <p className="text-yellow-800 dark:text-yellow-200 text-sm">
        {t("notAvailable")}
      </p>
    </div>
  );
}

function InstallationGuide({
  platform,
  t,
}: {
  platform: Platform;
  t: ReturnType<typeof useTranslations<"download">>;
}) {
  const steps =
    platform === "macos"
      ? [t("stepMac1"), t("stepMac2"), t("stepMac3"), t("stepMac4")]
      : platform === "windows"
        ? [t("stepWin1"), t("stepWin2"), t("stepWin3"), t("stepWin4")]
        : [t("stepLinux1"), t("stepLinux2Deb"), t("stepLinux2AppImage"), t("stepLinux3")];

  const title =
    platform === "macos"
      ? t("installMacOS")
      : platform === "windows"
        ? t("installWindows")
        : t("installLinux");

  return (
    <div className="bg-zinc-50 dark:bg-zinc-900 rounded-2xl p-8 border border-zinc-200 dark:border-zinc-800">
      <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
        {title}
      </h3>
      <ol className="space-y-3 text-zinc-600 dark:text-zinc-400">
        {steps.map((step, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 bg-zinc-200 dark:bg-zinc-700 rounded-full flex items-center justify-center text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {i + 1}
            </span>
            <span className={platform === "linux" && i > 0 && i < 3 ? "font-mono text-sm" : ""}>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={`text-white ${className}`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg className={`text-white ${className}`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M3 5.5l7-1v7h-7zM3 12.5h7v7l-7-1zM11 4.4l10-1.4v9h-10zM11 13h10v9l-10-1.4z" />
    </svg>
  );
}

function LinuxIcon({ className }: { className?: string }) {
  return (
    <svg className={`text-white ${className}`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.468v.023c.004.2.062.398.119.463.57.065.094.2.062.132.039.03.082.065.124.066.043.067.083.135.124.2.076.134.156.267.259.4.067.065.122.133.127.2.005.067-.038.133-.102.2a.76.76 0 01-.251.265c-.108.066-.217.132-.33.2-.228.131-.46.198-.689.132-.065-.027-.209-.066-.339-.198a1.145 1.145 0 01-.32-.465c-.067-.2-.117-.4-.151-.6-.033-.2-.051-.4-.051-.6a2.94 2.94 0 01.033-.533 2.76 2.76 0 01.1-.532 2.46 2.46 0 01.166-.466c.064-.133.141-.261.229-.4a2.25 2.25 0 01.293-.333c.111-.1.234-.199.358-.267a1.498 1.498 0 01.411-.2c.146-.033.296-.066.445-.066zM9.976 7.432c.4-.001.763.133 1.067.399.305.266.478.599.555.932.078.399.058.801-.058 1.134-.155.466-.457.864-.857 1.131-.133.09-.266.18-.4.2-.533.133-1.045-.133-1.378-.533-.334-.4-.534-.866-.6-1.398a2.2 2.2 0 01.055-.932c.11-.4.357-.732.666-.999.31-.266.69-.399 1.05-.434zm4.048 0c.4.035.78.168 1.089.434.309.267.556.599.666.999.078.332.089.666.055.932-.066.532-.266.998-.6 1.398-.333.4-.845.666-1.378.533-.134-.02-.267-.11-.4-.2-.4-.267-.702-.665-.857-1.131-.116-.333-.136-.735-.058-1.134.077-.333.25-.666.555-.932.304-.266.667-.4 1.067-.399z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
      />
    </svg>
  );
}
