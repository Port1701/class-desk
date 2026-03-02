interface ScrollToBottomButtonProps {
  onClick: () => void;
}

const ScrollToBottomButton = ({ onClick }: ScrollToBottomButtonProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Scroll to bottom"
    className="absolute -top-12 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 shadow-md flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors touch-manipulation"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="size-5"
    >
      <title>Scroll to bottom</title>
      <path
        fillRule="evenodd"
        d="M12.53 16.28a.75.75 0 0 1-1.06 0l-7.5-7.5a.75.75 0 0 1 1.06-1.06L12 14.69l6.97-6.97a.75.75 0 1 1 1.06 1.06l-7.5 7.5Z"
        clipRule="evenodd"
      />
    </svg>
  </button>
);

export default ScrollToBottomButton;
