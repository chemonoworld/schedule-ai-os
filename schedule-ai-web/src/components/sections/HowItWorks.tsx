"use client";

import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/ui/fade-in";

export function HowItWorks() {
  const t = useTranslations("howItWorks");

  const steps = [
    {
      number: "01",
      key: "step1",
      icon: <PenIcon />,
      color: "bg-teal-500",
    },
    {
      number: "02",
      key: "step2",
      icon: <BrainIcon />,
      color: "bg-teal-500",
    },
    {
      number: "03",
      key: "step3",
      icon: <RocketIcon />,
      color: "bg-teal-500",
    },
  ];

  return (
    <section className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <FadeIn className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
            {t("title")}
          </h2>
          <p className="text-lg text-zinc-600 dark:text-zinc-400 max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </FadeIn>

        <StaggerContainer className="grid md:grid-cols-3 gap-8 relative">
          {steps.map((step, index) => (
            <StaggerItem key={step.key}>
              <motion.div
                whileHover={{ y: -8 }}
                className="relative text-center"
              >
                {/* Step number */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 text-[120px] font-black text-zinc-200/80 dark:text-zinc-700/80 select-none leading-none">
                  {step.number}
                </div>

                {/* Icon */}
                <div
                  className={`relative z-10 w-20 h-20 mx-auto rounded-2xl ${step.color} flex items-center justify-center shadow-lg mb-6`}
                >
                  {step.icon}
                </div>

                {/* Content */}
                <h3 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-3">
                  {t(`${step.key}.title`)}
                </h3>
                <p className="text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {t(`${step.key}.description`)}
                </p>

                {/* Arrow for non-last items */}
                {index < steps.length - 1 && (
                  <div className="hidden md:block absolute top-24 -right-4 text-teal-400 dark:text-teal-600">
                    <ArrowIcon />
                  </div>
                )}
              </motion.div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </div>
    </section>
  );
}

function PenIcon() {
  return (
    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
    </svg>
  );
}
