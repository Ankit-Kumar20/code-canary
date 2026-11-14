import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Dependency Canary',
  description: 'AI-powered dependency vulnerability analysis and supply chain security',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-canvas text-ink antialiased`}>{children}</body>
    </html>
  );
}
