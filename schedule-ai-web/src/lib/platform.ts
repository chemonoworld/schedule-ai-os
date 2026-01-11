export type Platform = "macos" | "windows" | "linux" | "ios" | "android" | "unknown";

export function detectPlatform(): Platform {
  if (typeof window === "undefined") return "unknown";

  const ua = navigator.userAgent.toLowerCase();

  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  if (ua.includes("android")) return "android";
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";

  return "unknown";
}
