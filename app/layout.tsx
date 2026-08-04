import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Отчеты ОНМК",
  description: "Формирование недельных/месячных отчётов по дневным файлам ОНМК",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
