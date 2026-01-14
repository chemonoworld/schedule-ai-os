export interface Asset {
  name: string;
  browser_download_url: string;
  size: number;
}

export interface Release {
  tag_name: string;
  published_at: string;
  assets: Asset[];
  body: string;
}

export interface PlatformAsset {
  url: string;
  size: number;
}

export interface ReleaseInfo {
  version: string;
  publishedAt: string;
  macOS: {
    applesilicon: PlatformAsset | null;
    intel: PlatformAsset | null;
  };
  windows: {
    exe: PlatformAsset | null;
    msi: PlatformAsset | null;
  };
  linux: {
    deb: PlatformAsset | null;
    appimage: PlatformAsset | null;
    rpm: PlatformAsset | null;
  };
}

const GITHUB_REPO = "chemonoworld/schedule-ai-os";

export async function getLatestRelease(): Promise<ReleaseInfo | null> {
  try {
    const headers: HeadersInit = {
      Accept: "application/vnd.github.v3+json",
    };

    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }

    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases`,
      {
        next: { revalidate: 3600 }, // Cache for 1 hour
        headers,
      }
    );

    if (!res.ok) {
      if (res.status === 404) {
        return null; // No releases yet
      }
      throw new Error(`Failed to fetch release: ${res.status}`);
    }

    const releases: Release[] = await res.json();

    // 최신 릴리즈 (published 또는 draft) 찾기
    const data = releases[0];

    if (!data) {
      return null; // No releases yet
    }

    // Find macOS DMG assets
    const macAarch64 = data.assets.find(
      (a) => a.name.endsWith(".dmg") && a.name.includes("aarch64")
    );
    const macX64 = data.assets.find(
      (a) => a.name.endsWith(".dmg") && a.name.includes("x64")
    );

    // Find Windows assets
    const winExe = data.assets.find(
      (a) => a.name.endsWith("-setup.exe") || a.name.endsWith("_x64-setup.exe")
    );
    const winMsi = data.assets.find((a) => a.name.endsWith(".msi"));

    // Find Linux assets
    const linuxDeb = data.assets.find((a) => a.name.endsWith(".deb"));
    const linuxAppImage = data.assets.find((a) => a.name.endsWith(".AppImage"));
    const linuxRpm = data.assets.find((a) => a.name.endsWith(".rpm"));

    const toAsset = (a: Asset | undefined): PlatformAsset | null =>
      a ? { url: a.browser_download_url, size: a.size } : null;

    return {
      version: data.tag_name,
      publishedAt: data.published_at,
      macOS: {
        applesilicon: toAsset(macAarch64),
        intel: toAsset(macX64),
      },
      windows: {
        exe: toAsset(winExe),
        msi: toAsset(winMsi),
      },
      linux: {
        deb: toAsset(linuxDeb),
        appimage: toAsset(linuxAppImage),
        rpm: toAsset(linuxRpm),
      },
    };
  } catch (error) {
    console.error("Failed to fetch release:", error);
    return null;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
