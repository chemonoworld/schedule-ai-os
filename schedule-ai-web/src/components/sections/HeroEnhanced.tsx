"use client";

import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MacWindow } from "@/components/ui/mac-window";

export function HeroEnhanced() {
  const t = useTranslations("hero");

  return (
    <section className="relative pt-32 pb-20 px-6 overflow-hidden gradient-bg">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="orb-blue w-72 h-72 top-20 -left-20" />
        <div className="orb-purple w-96 h-96 bottom-20 -right-20" />
        <div className="orb-pink w-64 h-64 top-1/2 left-1/3" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Text content */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center lg:text-left"
          >
            <Badge
              variant="secondary"
              className="mb-6 px-4 py-2 text-sm font-medium bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
            >
              <span className="relative flex h-2 w-2 mr-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              {t("badge")}
            </Badge>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight mb-6">
              {t("title1")}
              <br />
              <span className="gradient-text">{t("title2")}</span>
            </h1>

            <p className="text-xl text-zinc-600 dark:text-zinc-400 max-w-xl mx-auto lg:mx-0 mb-8 leading-relaxed">
              {t("description")}
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Button
                asChild
                size="lg"
                className="rounded-full px-8 py-6 text-lg font-medium"
              >
                <Link href="/download">
                  <AppleIcon className="mr-2" />
                  {t("downloadMac")}
                </Link>
              </Button>
            </div>

            <p className="text-sm text-zinc-500 mt-4">{t("footnote")}</p>
          </motion.div>

          {/* Right: App screenshot */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="relative transform lg:rotate-1 hover:rotate-0 transition-transform duration-500">
              <MacWindow title="Schedule AI" className="shadow-2xl">
                <Image
                  src="/screenshots/today-main.svg"
                  alt="Schedule AI Today View"
                  width={800}
                  height={600}
                  className="w-full h-auto"
                  priority
                  unoptimized
                />
              </MacWindow>

              {/* Floating badges */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5, duration: 0.4 }}
                className="absolute -bottom-4 -left-4 glass-card rounded-xl px-4 py-3 shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center">
                    <CheckIcon />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      5 tasks completed
                    </p>
                    <p className="text-xs text-zinc-500">Today</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7, duration: 0.4 }}
                className="absolute -top-4 -right-4 glass-card rounded-xl px-4 py-3 shadow-lg"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
                    <FireIcon />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      7 day streak
                    </p>
                    <p className="text-xs text-zinc-500">Keep going!</p>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-5 h-5 ${className}`} fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function FireIcon() {
  return (
    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 23c-4.97 0-9-3.58-9-8 0-2.75 1.25-5.04 2.59-6.83.67-.89 1.38-1.66 2.01-2.27.31-.3.6-.56.84-.77l.24-.21.08-.07.03-.02.01-.01L10 6l1.2-1.17.01.01.03.02.08.07.24.21c.24.21.53.47.84.77.63.61 1.34 1.38 2.01 2.27C15.75 9.96 17 12.25 17 15c0 4.42-4.03 8-9 8z" />
    </svg>
  );
}
