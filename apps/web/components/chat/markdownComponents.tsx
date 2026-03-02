import type { Components } from 'react-markdown';

export const markdownComponents: Components = {
  a: ({ node, href, children, ...props }) => {
    if (href?.startsWith('#cite:')) {
      const actualHref = href.slice('#cite:'.length);
      return (
        <sup>
          <a
            {...props}
            href={actualHref}
            target="_blank"
            rel="noopener noreferrer"
            className="citation-btn"
          >
            {children}
          </a>
        </sup>
      );
    }
    return (
      <a
        {...props}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:opacity-80 transition-opacity"
      >
        {children}
      </a>
    );
  },
  ul: ({ node, ...props }) => <ul {...props} className="list-disc list-inside" />,
  li: ({ node, ...props }) => <li {...props} className="ml-4" />,
  table: ({ node, ...props }) => (
    <table
      {...props}
      className="w-full border-collapse border border-gray-300 dark:border-gray-600 my-3"
    />
  ),
  thead: ({ node, ...props }) => <thead {...props} className="bg-gray-100 dark:bg-gray-800" />,
  tbody: ({ node, ...props }) => <tbody {...props} />,
  tr: ({ node, ...props }) => (
    <tr {...props} className="border-b border-gray-300 dark:border-gray-600" />
  ),
  th: ({ node, ...props }) => (
    <th
      {...props}
      className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left font-semibold"
    />
  ),
  td: ({ node, ...props }) => (
    <td {...props} className="border border-gray-300 dark:border-gray-600 px-3 py-2" />
  ),
  hr: () => <div className="h-4" aria-hidden="true" />,
};
