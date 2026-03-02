'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

interface DocData {
  title: string;
  content: string;
  slug: string;
}

// Hide the '** Content' flag line and everything before it
const processContent = (raw: string): string => {
  const lines = raw.split('\n');
  const flagIdx = lines.findIndex((line) => line.includes('** Content'));
  if (flagIdx === -1) return raw;
  return lines.slice(flagIdx + 1).join('\n');
};

export default function DocPage() {
  const { slug } = useParams<{ slug: string }>();
  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await fetch(`${apiUrl}/docs/${slug}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) {
          throw new Error(`API error: ${res.statusText}`);
        }
        const data = (await res.json()) as DocData;
        setDoc(data);
      } catch (err) {
        console.error('[DocPage] Failed to load document:', err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };

    if (slug) fetchDoc();
  }, [slug, apiUrl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="text-gray-500 dark:text-gray-400 text-sm">Loading...</div>
        </div>
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900">
        <div className="max-w-2xl mx-auto px-6 py-8">
          <p className="text-gray-600 dark:text-gray-400 mb-4">Document not found.</p>
          <Link href="/" className="text-sm text-primary dark:text-blue-400 hover:underline">
            ← Back to ClassDesk
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="max-w-2xl mx-auto px-6 py-8 font-sans">
        <Link
          href="/"
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary dark:hover:text-blue-400 hover:underline mb-6 block"
        >
          ← Back to ClassDesk
        </Link>
        <h1 className="text-2xl font-bold text-primary dark:text-white mb-4 leading-snug">
          {doc.title}
        </h1>
        <hr className="border-gray-200 dark:border-gray-700 mb-6" />
        <div className="text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap text-sm">
          {processContent(doc.content)}
        </div>
      </div>
    </div>
  );
}
