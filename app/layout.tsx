import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'وصلة — كل روابطك في مكان واحد', description: 'صفحة واحدة لروابطك، مع رمز QR وإحصائيات بسيطة.', icons: { icon: '/favicon.svg' } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ar" dir="rtl"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" /><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;800&family=Tajawal:wght@400;500;700&family=Amiri:wght@400;700&family=Reem+Kufi:wght@500;700&family=Lalezar&display=swap" rel="stylesheet" /></head><body>{children}</body></html>; }
