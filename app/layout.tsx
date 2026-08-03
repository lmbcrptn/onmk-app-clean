import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Сводки ОНМК",
  description: "Формирование недельных/месячных сводок по дневным файлам ОНМК",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
