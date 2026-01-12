import {
  Header,
  HeroEnhanced,
  AppShowcase,
  HowItWorks,
  Features,
  ADHDFocused,
  FinalCTA,
  Footer,
} from "@/components";

export default function Home() {
  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950">
      <Header />
      <main>
        <HeroEnhanced />
        <AppShowcase />
        <HowItWorks />
        <Features />
        <ADHDFocused />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
