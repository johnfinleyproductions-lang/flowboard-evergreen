import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Flowboard - Command Board",
  description: "Personal GTD command board: capture, triage, kanban, whiteboard.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
