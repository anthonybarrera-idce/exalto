import "@fontsource-variable/geist"
import "./index.css"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import { ThemeProvider } from "./hooks/use-theme"
import { LocaleProvider } from "./hooks/use-locale"
import { TooltipProvider } from "./components/ui/tooltip"
import { Toaster } from "./components/ui/sonner"

createRoot(document.getElementById("root")!).render(
  <LocaleProvider>
    <ThemeProvider>
      <TooltipProvider>
        <App />
        <Toaster position="bottom-right" />
      </TooltipProvider>
    </ThemeProvider>
  </LocaleProvider>,
)
