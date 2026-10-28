import { useEffect } from "react";
import { Header } from "@/components/landing/Header";
import { Hero } from "@/components/landing/Hero";
import { Features } from "@/components/landing/Features";
import { SampleNewsletter } from "@/components/landing/SampleNewsletter";
import { Editor } from "@/components/landing/Editor";
import { Footer } from "@/components/landing/Footer";
import { SITE } from "@/lib/site";

const Index = () => {
  useEffect(() => {
    document.title = `${SITE.name} — ${SITE.tagline}`;
    document.querySelector('meta[name="description"]')?.setAttribute("content", SITE.description);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="pt-16">
        <Hero />
        <Features />
        <SampleNewsletter />
        <Editor />
        <Footer />
      </main>
    </div>
  );
};

export default Index;
