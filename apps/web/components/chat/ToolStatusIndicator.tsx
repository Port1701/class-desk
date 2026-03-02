import type { ToolStatus } from '@/lib/textProcessing';

interface ToolStatusIndicatorProps {
  toolStatus: ToolStatus | null;
  /** "typing" = waiting for first content (always shows dots, bigger)
   *  "inline" = mid-response tool call (conditional dots, smaller) */
  variant?: 'typing' | 'inline';
  className?: string;
}

const config = {
  typing: { dot: 'size-2', py: 'py-2' },
  inline: { dot: 'size-1.5', py: 'py-1.5' },
} as const;

const ToolStatusIndicator = ({
  toolStatus,
  variant = 'inline',
  className = '',
}: ToolStatusIndicatorProps) => {
  const isTyping = variant === 'typing';

  // "typing" renders even without toolStatus (shows dots alone)
  // "inline" only renders when toolStatus is present
  if (!isTyping && !toolStatus) return null;

  const { dot, py } = config[variant];
  const showDots = isTyping || toolStatus?.duration == null;

  return (
    <div
      className={`inline-flex items-center gap-2 bg-gray-200 dark:bg-gray-700 rounded-full px-3 ${py} ${className}`}
    >
      {showDots && (
        <>
          <span className={`${dot} rounded-full bg-gray-400 dark:bg-gray-500 animate-typing-dot`} />
          <span
            className={`${dot} rounded-full bg-gray-400 dark:bg-gray-500 animate-typing-dot [animation-delay:200ms]`}
          />
          <span
            className={`${dot} rounded-full bg-gray-400 dark:bg-gray-500 animate-typing-dot [animation-delay:400ms]`}
          />
        </>
      )}
      {toolStatus && (
        <span className={`text-xs text-gray-500 dark:text-gray-400${isTyping ? ' ml-1' : ''}`}>
          {toolStatus.duration != null
            ? `${toolStatus.label} (${toolStatus.duration}s)`
            : `${toolStatus.label}...`}
        </span>
      )}
    </div>
  );
};

export default ToolStatusIndicator;
