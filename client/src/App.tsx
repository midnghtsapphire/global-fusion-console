import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Router, Switch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import FusionShell, { STATIC_MODE } from "./components/FusionShell";
import Home from "./pages/Home";
import Digest from "./pages/Digest";
import Integrations from "./pages/Integrations";
import Privacy from "./pages/Privacy";
function Routes() {
  return <FusionShell><Switch><Route path="/" component={Home} /><Route path="/digest" component={Digest} /><Route path="/integrations" component={Integrations} /><Route path="/privacy" component={Privacy} /><Route component={NotFound} /></Switch></FusionShell>;
}
export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="dark"><TooltipProvider><Toaster /><Router hook={STATIC_MODE ? useHashLocation : undefined}><Routes /></Router></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
