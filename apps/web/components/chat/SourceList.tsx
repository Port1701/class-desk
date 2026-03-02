import type { SourceEntry } from '@/lib/textProcessing';

interface SourceListProps {
  sources: SourceEntry[];
}

const SourceList = ({ sources }: SourceListProps) => {
  if (sources.length === 0) return null;

  const docSources = sources.filter(
    (s): s is Extract<SourceEntry, { type: 'document' }> => s.type === 'document',
  );
  const webSources = sources.filter(
    (s): s is Extract<SourceEntry, { type: 'web' }> => s.type === 'web',
  );

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      {docSources.length > 0 && (
        <div className="space-y-0.5">
          {docSources.map((source, i) => (
            <div key={source.slug} className="flex items-baseline gap-1.5">
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 shrink-0">
                [{i + 1}]
              </span>
              <a
                href={`/docs/${source.slug}`}
                className="text-xs text-primary dark:text-blue-400 hover:underline truncate"
              >
                {source.title}
              </a>
            </div>
          ))}
        </div>
      )}
      {webSources.length > 0 && (
        <div className={`space-y-0.5 ${docSources.length > 0 ? 'mt-2' : ''}`}>
          {webSources.map((source) => (
            <div key={source.url} className="flex items-baseline gap-1.5">
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">↗</span>
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 dark:text-gray-400 hover:underline truncate"
              >
                {source.title ?? source.url}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SourceList;
