import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PremiumProvider } from "@/contexts/PremiumContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { isNativeApp } from "@/lib/nativeDetection";
import { registerShareIntent } from "@/lib/shareIntent";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AdminPanel from "./pages/AdminPanel.tsx";
import AppleCallback from "./pages/AppleCallback.tsx";
import Support from "./pages/Support.tsx";
import Privacy from "./pages/Privacy.tsx";
import Landing from "./pages/Landing.tsx";
import ManualUploadGuide from "./pages/ManualUploadGuide.tsx";

const queryClient = new QueryClient();
const native = isNativeApp();
registerShareIntent();

// Route `/` → Index when:
//  - we're inside the native app, OR
//  - the URL carries in-app query params (e.g. ?tab=more&page=connect-apps)
//    used by post-OAuth redirects, OR
//  - the URL hash carries OAuth tokens (e.g. #access_token=...) returned by
//    Supabase's signInWithOAuth (Apple/Google) — otherwise the user lands
//    on the marketing page and appears signed-out even though a session was
//    just created.
// Otherwise show the marketing Landing.
const RootRoute = () => {
  if (native) return <Index />;
  const params = new URLSearchParams(window.location.search);
  if (params.has("tab") || params.has("page")) return <Index />;
  const hash = window.location.hash || "";
  if (hash.includes("access_token=") || hash.includes("refresh_token=") || hash.includes("type=recovery")) {
    return <Index />;
  }
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
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </PremiumProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
