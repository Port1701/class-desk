interface SuggestionPillProps {
  label: string;
  onClick: () => void;
}

const SuggestionPill = ({ label, onClick }: SuggestionPillProps) => (
  <button
    type="button"
    onClick={onClick}
    className="bg-white dark:bg-gray-800/60 border border-gray-300 dark:border-gray-700 rounded-full px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:border-primary-mid dark:hover:border-primary-light hover:shadow-[0_0_12px_rgba(0,53,107,0.15)] dark:hover:shadow-[0_0_14px_rgba(99,187,230,0.25)] transition-all cursor-pointer"
  >
    {label}
  </button>
);

export default SuggestionPill;
