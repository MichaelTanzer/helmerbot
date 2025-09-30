import './globals.css';
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const mono  = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' });

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
    <img
      src="/HelmerShades.jpg"
      alt="HelmerBot logo"
      style={{ marginTop: '6px', height: '120px', width: 'auto', borderRadius: '16px' }}
    />
  </div>
  <nav className="controls-inline">
    <a className="btn btn-ghost" href="/">Screen</a>
  </nav>
</header>

        <main className="shell">{children}</main>
        <div className="bg-grid" aria-hidden="true" />
      </body>
    </html>
  );
}
