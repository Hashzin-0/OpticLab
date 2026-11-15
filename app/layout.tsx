import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpticLab — edição fotográfica automática",
  description: "Envie uma fotografia. Receba uma edição fotográfica calculada automaticamente.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}