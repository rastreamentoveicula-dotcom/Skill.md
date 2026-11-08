import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Recriar Motion AI — Motion Studio', description: 'Transforme ideias em vídeos extraordinários.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body>{children}</body></html>; }
