import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegister } from "@/components/pwa-register";

export const metadata: Metadata = {
  title: { default: "Garbage Mania", template: "%s" },
  applicationName: "Garbage Mania",
  description: "Garbage Mania Services Ltd — waste management, Nairobi, Kenya.",
};

export const viewport: Viewport = {
  themeColor: "#1F7A45",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
