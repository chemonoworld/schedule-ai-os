"use client";

import { cn } from "@/lib/utils";

interface MacWindowProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
}

export function MacWindow({ children, className, title }: MacWindowProps) {
  return (
    <div
      className={cn(
        "rounded-xl overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-700",
        className
      )}
    >
      {/* Title bar with traffic lights */}
      <div className="bg-zinc-100 dark:bg-zinc-800 px-4 py-3 flex items-center gap-2">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-600 transition-colors" />
          <div className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors" />
          <div className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-600 transition-colors" />
        </div>
        {title && (
          <span className="flex-1 text-center text-sm text-zinc-500 dark:text-zinc-400 font-medium">
            {title}
          </span>
        )}
      </div>
      {/* Content */}
      <div className="bg-white dark:bg-zinc-900">{children}</div>
    </div>
  );
}
