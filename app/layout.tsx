import "./globals.css";
export const metadata = {
  icons: { icon: "/favicon.svg" },
  title: "PharmaQ — Управление отклонениями",
  description:
    "Демонстрационный MVP системы качества фармацевтического производства",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
