import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Pretty Basic · PPIC",
  description: "PPIC System Pretty Basic",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className={`${jakarta.variable} antialiased`}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: { fontFamily: "var(--font-jakarta)", fontSize: 13, borderRadius: 10 },
          }}
        />
      </body>
    </html>
  );
}
