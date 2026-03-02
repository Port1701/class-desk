import type { Metadata, Viewport } from 'next';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export const metadata: Metadata = {
  title: {
    default: 'ClassDesk',
    template: '%s | ClassDesk',
  },
  description: 'ClassDesk — your AI assistant.',
  keywords: [
    'Next.js',
    'React',
    'Express',
    'Node.js',
    'TypeScript',
    'Tailwind CSS',
    'Full Stack',
    'ClassDesk',
    'Supabase',
    'Redis',
  ],
  authors: [{ name: 'Your Name' }],
  creator: 'Your Name',
  publisher: 'Your Name',
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    siteName: 'ClassDesk',
    title: 'ClassDesk',
    description: 'ClassDesk — your AI assistant.',
    // Customize: Add your organization's logo images here
    // images: [
    //   {
    //     url: '/logos/your-og-image.png',
    //     width: 1200,
    //     height: 630,
    //     alt: 'ClassDesk',
    //   },
    // ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClassDesk',
    description: 'ClassDesk — your AI assistant.',
    // Customize: Add your organization's logo image here
    // images: ['/logos/your-twitter-image.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  // Note: Icons (favicon, apple-icon) are auto-detected from app/ directory
  // Place icon.svg, favicon.ico, and apple-icon.png in app/ directory
  // See: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons
};
