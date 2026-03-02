import { redirect } from 'next/navigation';
import LogoutButton from '@/components/console/LogoutButton';
import ThemeToggle from '@/components/ThemeToggle';
import { createClient } from '@/lib/supabase/server';

const ProtectedConsoleLayout = async ({ children }: { children: React.ReactNode }) => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <header className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-gray-900 dark:text-white">ClassDesk</span>
            <span className="text-gray-400 dark:text-gray-500">|</span>
            <span className="text-sm text-gray-600 dark:text-gray-400">Console</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-700 dark:text-gray-300">{user.email}</span>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
};

export default ProtectedConsoleLayout;
