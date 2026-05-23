import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PremiumProvider } from "@/contexts/PremiumContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { isNativeApp } from "@/lib/nativeDetection";
import { registerShareIntent } from "@/lib/shareIntent";
import { useAuth } from "@/contexts/AuthContext";

// Lazy-load route pages so initial bundle only includes what the first paint needs.
const Index = lazy(() => import("./pages/Index.tsx"));
const Landing = lazy(() => import("./pages/Landing.tsx"));
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const AdminPanel = lazy(() => import("./pages/AdminPanel.tsx"));
const AppleCallback = lazy(() => import("./pages/AppleCallback.tsx"));
const Support = lazy(() => import("./pages/Support.tsx"));
const Privacy = lazy(() => import("./pages/Privacy.tsx"));
const TerraReturn = lazy(() => import("./pages/TerraReturn.tsx"));

const queryClient = new QueryClient();
const native = isNativeApp();
registerShareIntent();

// Detect OAuth-return URLs synchronously (before Supabase consumes the hash).
const initialHash = typeof window !== "undefined" ? (window.location.hash || "") : "";
const initialSearch = typeof window !== "undefined" ? window.location.search : "";
const initialParams = new URLSearchParams(initialSearch);
const hadOAuthHash =
  initialHash.includes("access_token=") ||
  initialHash.includes("refresh_token=") ||
  initialHash.includes("type=recovery");
const hadInAppParams = initialParams.has("tab") || initialParams.has("page");

const RouteFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const RootRoute = () => {
  const { session, loading } = useAuth();
  if (native) return <Index />;
  if (hadInAppParams || hadOAuthHash) return <Index />;
  if (loading) return <Index />;
  if (session?.user) return <Index />;
  return <Landing />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <ThemeProvider>
        <PremiumProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<RootRoute />} />
                <Route path="/callback/apple" element={<AppleCallback />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/support" element={<Support />} />
                <Route path="/privacy" element={<Privacy />} />
                <Route path="/terra-return" element={<TerraReturn />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </PremiumProvider>
        </ThemeProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
