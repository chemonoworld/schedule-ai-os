"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function Header() {
  const t = useTranslations("header");

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-black/80 backdrop-blur-md border-b border-zinc-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
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

        <nav className="flex items-center gap-4">
          <Link
            href="#features"
            className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
          >
            {t("features")}
          </Link>
          <Link
            href="/download"
            className="text-sm bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-full hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            {t("download")}
          </Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
