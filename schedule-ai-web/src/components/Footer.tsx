"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="py-12 px-6 border-t border-zinc-200 dark:border-zinc-800">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
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
          </div>

          <nav className="flex items-center gap-6">
            <Link
              href="/download"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              {t("download")}
            </Link>
            {/* GitHub 링크 - 오픈소스 공개 시 활성화
            <a
              href="https://github.com/chemonoworld/schedule-ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              {t("github")}
            </a>
            <a
              href="https://github.com/chemonoworld/schedule-ai/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 transition-colors"
            >
              {t("feedback")}
            </a>
            */}
          </nav>
        </div>

        <div className="mt-8 pt-8 border-t border-zinc-200 dark:border-zinc-800 text-center">
          <p className="text-sm text-zinc-500">{t("tagline")}</p>
        </div>
      </div>
    </footer>
  );
}
