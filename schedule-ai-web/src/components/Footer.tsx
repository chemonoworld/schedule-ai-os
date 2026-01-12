"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="py-12 px-6 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <Link href="/" className="flex items-center gap-2 group">
            <Image
              src="/icon.svg"
              alt="Schedule AI"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-semibold text-lg text-zinc-900 dark:text-zinc-100">
              Schedule AI
            </span>
          </Link>

          <nav className="flex items-center gap-6">
            <Link
              href="/download"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              {t("download")}
            </Link>
            <Link
              href="#features"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              Features
            </Link>
          </nav>
        </div>

        <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-zinc-500">{t("tagline")}</p>
          <p className="text-sm text-zinc-400">
            © {new Date().getFullYear()} Schedule AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
