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
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AdminPanel from "./pages/AdminPanel.tsx";
import AppleCallback from "./pages/AppleCallback.tsx";
import Support from "./pages/Support.tsx";
import Privacy from "./pages/Privacy.tsx";
import Landing from "./pages/Landing.tsx";

import TerraReturn from "./pages/TerraReturn.tsx";

const queryClient = new QueryClient();
const native = isNativeApp();
registerShareIntent();

// Detect OAuth-return URLs synchronously (before Supabase consumes the hash).
// Persisted as a module-level flag so subsequent renders/navigations during
// the same page lifecycle still treat the visit as an in-app entry.
const initialHash = typeof window !== "undefined" ? (window.location.hash || "") : "";
const initialSearch = typeof window !== "undefined" ? window.location.search : "";
const initialParams = new URLSearchParams(initialSearch);
const hadOAuthHash =
  initialHash.includes("access_token=") ||
  initialHash.includes("refresh_token=") ||
  initialHash.includes("type=recovery");
const hadInAppParams = initialParams.has("tab") || initialParams.has("page");

// Route `/` → Index when:
//  - we're inside the native app, OR
//  - the URL carries in-app query params (post-OAuth redirects), OR
//  - the URL hash carries OAuth tokens (Supabase OAuth return), OR
//  - the user already has an authenticated session (e.g. logged-in user
//    revisiting the root URL — without this they land on the marketing page).
// Otherwise show the marketing Landing.
const RootRoute = () => {
  const { session, loading } = useAuth();
  if (native) return <Index />;
  if (hadInAppParams || hadOAuthHash) return <Index />;
  // While auth state is still resolving, don't flash Landing for an
  // already-signed-in user. Render Index which has its own loading UI.
  if (loading) return <Index />;
  if (session?.user) return <Index />;
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
            <Routes>
              <Route path="/" element={<RootRoute />} />
              <Route path="/callback/apple" element={<AppleCallback />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/support" element={<Support />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/manual-upload-guide" element={<ManualUploadGuide />} />
              <Route path="/terra-return" element={<TerraReturn />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </PremiumProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
