"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MacWindow } from "@/components/ui/mac-window";
import { FadeIn } from "@/components/ui/fade-in";

type TabValue = "today" | "focus" | "plans" | "progress";

const TAB_COLOR = "bg-teal-500";

const tabScreenshots: Record<TabValue, string> = {
  today: "/screenshots/today-main.png",
  focus: "/screenshots/focus-timer.png",
  plans: "/screenshots/plans-ai.png",
  progress: "/screenshots/progress-heatmap.png",
};

export function AppShowcase() {
  const t = useTranslations("showcase");
  const [activeTab, setActiveTab] = useState<TabValue>("today");

  return (
    <section className="py-24 px-6 bg-zinc-50 dark:bg-zinc-900/50">
      <div className="max-w-7xl mx-auto">
        <FadeIn className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            {t("title")}
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </FadeIn>

        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Tabs and description */}
          <FadeIn direction="left" className="order-2 lg:order-1">
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as TabValue)}
              className="w-full"
            >
              <TabsList className="grid grid-cols-4 mb-8">
                <TabsTrigger value="today" className="text-sm">
                  {t("tabs.today")}
                </TabsTrigger>
                <TabsTrigger value="focus" className="text-sm">
                  {t("tabs.focus")}
                </TabsTrigger>
                <TabsTrigger value="plans" className="text-sm">
                  {t("tabs.plans")}
                </TabsTrigger>
                <TabsTrigger value="progress" className="text-sm">
                  {t("tabs.progress")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
                className="glass-card rounded-2xl p-8"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${TAB_COLOR}`}>
                    <TabIcon tab={activeTab} />
                  </div>
                  <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                    {t(`${activeTab}.title`)}
                  </h3>
                </div>
                <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {t(`${activeTab}.description`)}
                </p>
              </motion.div>
            </AnimatePresence>
          </FadeIn>

          {/* Right: Screenshot */}
          <FadeIn direction="right" className="order-1 lg:order-2">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                transition={{ duration: 0.3 }}
              >
                <MacWindow className="shadow-2xl">
                  <Image
                    src={tabScreenshots[activeTab]}
                    alt={`Schedule AI ${activeTab} view`}
                    width={800}
                    height={600}
                    className="w-full h-auto"
                  />
                </MacWindow>
              </motion.div>
            </AnimatePresence>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function TabIcon({ tab }: { tab: TabValue }) {
  const icons: Record<TabValue, React.ReactNode> = {
    today: (
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    focus: (
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    plans: (
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
      </svg>
    ),
    progress: (
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  };

  return icons[tab];
}
