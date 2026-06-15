import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PremiumProvider } from "@/contexts/PremiumContext";
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
const DeleteAccount = lazy(() => import("./pages/DeleteAccount.tsx"));
const TerraReturn = lazy(() => import("./pages/TerraReturn.tsx"));
const SuuntoReturn = lazy(() => import("./pages/SuuntoReturn.tsx"));
const PolarReturn = lazy(() => import("./pages/PolarReturn.tsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.tsx"));
const AuthCallback = lazy(() => import("./pages/AuthCallback.tsx"));
const StravaCallback = lazy(() => import("./pages/StravaCallback.tsx"));
const IntervalsCallback = lazy(() => import("./pages/IntervalsCallback.tsx"));
const Compare = lazy(() => import("./pages/Compare.tsx"));
const Developers = lazy(() => import("./pages/Developers.tsx"));
const OAuthAuthorize = lazy(() => import("./pages/OAuthAuthorize.tsx"));

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
const hadOAuthReturn = hadOAuthHash || initialParams.has("code") || initialParams.has("error");
const RouteFallback = () => (
  <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-3">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
  </div>
);

const RootRoute = () => {
  const { session, loading } = useAuth();
  // Only the native app shell can access the in-app Index experience.
  if (native) return <Index />;
  // OAuth/in-app redirects still need to hit Index so callbacks complete.
  if (hadOAuthReturn) return <Index />;
  // All browser users (desktop + mobile Safari/Chrome) get the marketing site.
  if (loading) return <Landing />;
  return <Landing />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
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
                <Route path="/delete-account" element={<DeleteAccount />} />
                <Route path="/terra-return" element={<TerraReturn />} />
                <Route path="/suunto-return" element={<SuuntoReturn />} />
                <Route path="/suunto/callback" element={<SuuntoReturn />} />
                <Route path="/polar-return" element={<PolarReturn />} />
                <Route path="/polar/callback" element={<PolarReturn />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/compare" element={<Compare />} />
                <Route path="/auth" element={<AuthCallback />} />
                <Route path="/auth/callback" element={<StravaCallback />} />
                <Route path="/intervals-callback" element={<IntervalsCallback />} />
                <Route path="/developers" element={<Developers />} />
                <Route path="/oauth/authorize" element={<OAuthAuthorize />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </PremiumProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
