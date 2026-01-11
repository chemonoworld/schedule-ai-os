"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/fade-in";

export function ADHDFocused() {
  const t = useTranslations("adhd");

  const cards = [
    {
      key: "card1",
      icon: <ShieldIcon />,
      color: "from-red-500 to-orange-500",
    },
    {
      key: "card2",
      icon: <SparklesIcon />,
      color: "from-purple-500 to-blue-500",
    },
    {
      key: "card3",
      icon: <ChartIcon />,
      color: "from-green-500 to-emerald-500",
    },
  ];

  return (
    <section className="py-24 px-6 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="orb-purple w-96 h-96 top-0 right-0" />
        <div className="orb-blue w-72 h-72 bottom-0 left-0" />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <FadeIn className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            {t("title")}
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </FadeIn>

        <StaggerContainer className="grid md:grid-cols-3 gap-8">
          {cards.map((card) => (
            <StaggerItem key={card.key}>
              <motion.div whileHover={{ y: -8, scale: 1.02 }} transition={{ type: "spring", stiffness: 300 }}>
                <Card className="h-full glass-card border-0 hover:shadow-2xl transition-shadow duration-300">
                  <CardHeader>
                    <div
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${card.color} flex items-center justify-center mb-4`}
                    >
                      {card.icon}
                    </div>
                    <CardTitle className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                      {t(`${card.key}.title`)}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {t(`${card.key}.description`)}
                    </CardDescription>
                  </CardContent>
                </Card>
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  );
}
