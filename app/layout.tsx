import type React from "react"
import type { Metadata } from "next"
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google"
import Script from "next/script"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

const _geist = Geist({ subsets: ["latin"] })
const _geistMono = Geist_Mono({ subsets: ["latin"] })
// Display face for headings and big numbers; Geist stays the body font.
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-bricolage" })
const themeInitializationScript = `
  (function () {
    try {
      var root = document.documentElement
      var savedTheme = localStorage.getItem("theme")
      var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
      var resolvedTheme = savedTheme === "system" || !savedTheme ? (prefersDark ? "dark" : "light") : savedTheme

      if (resolvedTheme === "dark") {
        root.classList.add("dark")
      } else {
        root.classList.remove("dark")
      }
    } catch (error) {
      // Falha de acesso a storage/matchMedia nao deve bloquear renderizacao
    }
  })()
`

export const metadata: Metadata = {
  title: "Jobusque",
  description: "Central de vagas do job-search: o que está aberto e qual é a próxima candidatura",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={bricolage.variable} suppressHydrationWarning>
      <head>
        <Script id="theme-initialization" strategy="beforeInteractive">
          {themeInitializationScript}
        </Script>
      </head>
      <body className={`font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          {children}
          <Toaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
