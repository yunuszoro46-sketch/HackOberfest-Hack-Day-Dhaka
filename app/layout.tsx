import type { Metadata } from "next";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ToastProvider } from "@/components/console/Toast";
import { THEME_BOOT } from "@/lib/client/theme";

export const metadata: Metadata = {
  title: "TeamMate — The Human Has the Key",
  description: "TeamMate gets you to a prompt you trust. Not to code.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="console" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>
        <TooltipProvider delayDuration={200}>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
