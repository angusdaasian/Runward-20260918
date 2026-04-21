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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <PremiumProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={native ? <Index /> : <Landing />} />
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
