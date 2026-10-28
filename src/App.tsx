import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import Archive from "./pages/Archive";
import NewsletterIssue from "./pages/NewsletterIssue";
import Referrals from "./pages/Referrals";
import DealStats from "./pages/DealStats";
import PeopleMoves from "./pages/PeopleMoves";
import Unsubscribe from "./pages/Unsubscribe";
import Preferences from "./pages/Preferences";
import About from "./pages/About";
import Deals from "./pages/Deals";
import Funds from "./pages/Funds";
import Tip from "./pages/Tip";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
