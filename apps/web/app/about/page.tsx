import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn more about ClassDesk, your AI assistant.',
};

const AboutPage = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 gap-8 bg-white dark:bg-gray-900">
      <main className="flex flex-col gap-8 items-center max-w-2xl">
        <div className="text-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 text-gray-900 dark:text-white">
            About ClassDesk
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            Your AI assistant for your class
          </p>
        </div>

        <div className="w-full space-y-6">
          <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h2 className="text-2xl font-semibold mb-3 text-gray-900 dark:text-white">
              What is ClassDesk?
            </h2>
            <p className="text-gray-700 dark:text-gray-300 mb-3">
              Class information is often spread across many channels: emails, announcements, and
              various websites. ClassDesk consolidates everything into one searchable AI assistant.
            </p>
            <p className="text-gray-700 dark:text-gray-300">
              ClassDesk is loaded with documents and information relevant to your class or
              organization and keeps getting updated as new info comes in. Ask about events,
              registration, logistics, and more. Get answers with citations.
            </p>
          </div>

          <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h2 className="text-2xl font-semibold mb-3 text-gray-900 dark:text-white">
              What can I ask?
            </h2>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>
                &bull; <strong>General questions</strong> &mdash; Schedule, registration, costs,
                logistics
              </li>
              <li>
                &bull; <strong>Monday Form 1</strong> &mdash; ClassDesk can fill out this form for
                you
              </li>
              <li>
                &bull; <strong>Monday Form 2</strong> &mdash; ClassDesk can fill out this form as
                well
              </li>
            </ul>
          </div>

          <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h2 className="text-2xl font-semibold mb-3 text-gray-900 dark:text-white">Built by</h2>
            <p className="text-gray-700 dark:text-gray-300">
              <strong>Your Name</strong>, [Your Role] &mdash;{' '}
              <Link
                href="mailto:your@email.com"
                className="text-primary hover:text-primary-mid dark:text-primary-light underline"
              >
                your@email.com
              </Link>
            </p>
          </div>

          <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h2 className="text-2xl font-semibold mb-3 text-gray-900 dark:text-white">AI stack</h2>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>
                &bull; <strong>Models:</strong> Claude Haiku 4.5 (chatbot), Claude Sonnet 4.6
                (Claude Code)
              </li>
              <li>
                &bull; <strong>Framework:</strong> Vercel AI SDK
              </li>
              <li>
                &bull; <strong>Hybrid RAG:</strong> pgvector (vector search), pg_trgm (fuzzy
                search), tsvector (full-text search) for high-precision, high-recall retrieval
              </li>
              <li>
                &bull; <strong>Observability and evals:</strong> Langfuse
              </li>
            </ul>
          </div>

          <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h2 className="text-2xl font-semibold mb-3 text-gray-900 dark:text-white">
              Infra stack
            </h2>
            <ul className="space-y-2 text-gray-700 dark:text-gray-300">
              <li>
                &bull; <strong>Frontend:</strong> Next.js 15+, React 19, TypeScript, Tailwind CSS
              </li>
              <li>
                &bull; <strong>Frontend hosting:</strong> Vercel
              </li>
              <li>
                &bull; <strong>Server:</strong> Express 5, TypeScript
              </li>
              <li>
                &bull; <strong>Backend hosting:</strong> Railway
              </li>
              <li>
                &bull; <strong>Database:</strong> Supabase PostgreSQL
              </li>
              <li>
                &bull; <strong>Caching:</strong> Redis (via Railway)
              </li>
            </ul>
          </div>

          <div className="p-6 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            <h2 className="text-2xl font-semibold mb-3 text-gray-900 dark:text-white">
              Disclaimer
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              ClassDesk does its best to provide accurate information, but it&apos;s an AI and might
              occasionally get things wrong. For official details, contact your administrator.
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <Link
            href="/"
            className="px-6 py-3 bg-primary hover:bg-primary-mid text-white rounded-lg transition-colors"
          >
            &larr; Back to ClassDesk
          </Link>
        </div>
      </main>
    </div>
  );
};

export default AboutPage;
