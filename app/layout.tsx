import './globals.css';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import Image from 'next/image';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'HelmerBot',
  description: '7 Powers company screen and analysis',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>
        <header className="nav">
          <div>
            <div className="brand"><span className="brand-accent">Helmer</span>Bot</div>
            <Image
              src="/HelmerShades.jpg"
              alt="HelmerBot logo"
              width={240}
              height={240}
              style={{ marginTop: '6px', borderRadius: '8px', height: '120px', width: 'auto' }}
              priority
            />
          </div>
          <nav className="controls-inline">
            <Link className="btn btn-ghost" href="/">Screen</Link>
          </nav>
        </header>
        <main className="shell">{children}</main>
        <div className="bg-grid" aria-hidden="true" />
      </body>
    </html>
  );
}
