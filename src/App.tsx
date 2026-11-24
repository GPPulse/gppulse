import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
const Admin = lazy(() => import("./pages/Admin"));
const Archive = lazy(() => import("./pages/Archive"));
const NewsletterIssue = lazy(() => import("./pages/NewsletterIssue"));
const Referrals = lazy(() => import("./pages/Referrals"));
const DealStats = lazy(() => import("./pages/DealStats"));
const PeopleMoves = lazy(() => import("./pages/PeopleMoves"));
const Unsubscribe = lazy(() => import("./pages/Unsubscribe"));
const Preferences = lazy(() => import("./pages/Preferences"));
const About = lazy(() => import("./pages/About"));
const Deals = lazy(() => import("./pages/Deals"));
const Funds = lazy(() => import("./pages/Funds"));
const Tip = lazy(() => import("./pages/Tip"));
const Comps = lazy(() => import("./pages/Comps"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Sponsors = lazy(() => import("./pages/Sponsors"));
const Vote = lazy(() => import("./pages/Vote"));
const Privacy = lazy(() => import("./pages/Privacy"));
const NotFound = lazy(() => import("./pages/NotFound"));
import { SeoSync } from "./components/SeoSync";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {/* Only the landing page is in the first download; every other page loads its own code when opened. */}
        <Suspense fallback={<div className="min-h-screen bg-background" />}>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/archive" element={<Archive />} />
          <Route path="/archive/:id" element={<NewsletterIssue />} />
          <Route path="/referrals" element={<Referrals />} />
          <Route path="/deal-stats" element={<DealStats />} />
          <Route path="/people-moves" element={<PeopleMoves />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="/about" element={<About />} />
          <Route path="/deals" element={<Deals />} />
          <Route path="/funds" element={<Funds />} />
          <Route path="/tip" element={<Tip />} />
          <Route path="/comps" element={<Comps />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/sponsors" element={<Sponsors />} />
          <Route path="/vote" element={<Vote />} />
          <Route path="/privacy" element={<Privacy />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        <SeoSync />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
