'use client';

import { useState } from 'react';
import AdminsPanel from '@/components/console/AdminsPanel';
import DocumentsPanel from '@/components/console/DocumentsPanel';
import PromptsPanel from '@/components/console/PromptsPanel';
import StatsPanel from '@/components/console/StatsPanel';

type Tab = 'documents' | 'prompts' | 'stats' | 'admins';

const TABS: { key: Tab; label: string }[] = [
  { key: 'documents', label: 'Documents' },
  { key: 'prompts', label: 'Prompts' },
  { key: 'stats', label: 'Stats' },
  { key: 'admins', label: 'Admins' },
];

const ConsolePage = () => {
  const [activeTab, setActiveTab] = useState<Tab>('documents');

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`pb-2 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.key
                  ? 'border-primary text-primary dark:border-primary-light dark:text-primary-light'
                  : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'documents' && <DocumentsPanel />}
      {activeTab === 'prompts' && <PromptsPanel />}
      {activeTab === 'stats' && <StatsPanel />}
      {activeTab === 'admins' && <AdminsPanel />}
    </div>
  );
};

export default ConsolePage;
