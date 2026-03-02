'use client';

import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const LoginForm = () => {
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get('error') || '');
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (authError) {
        setError(authError.message);
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
      <div className="w-full max-w-sm">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8">
          <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-white mb-1">
            ClassDesk
          </h1>
          <p className="text-sm text-center text-gray-600 dark:text-gray-300 mb-6">Admin Console</p>

          {error && <p className="text-sm text-red-600 dark:text-red-400 mb-4">{error}</p>}

          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full px-4 py-2.5 font-medium rounded-md transition-colors border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed text-sm"
          >
            <Image
              src="/google-logo.svg"
              alt="Google"
              width={20}
              height={20}
              className="mr-2 -mt-0.5 inline-block"
            />
            {loading ? 'Redirecting...' : 'Continue with Google'}
          </button>
        </div>
      </div>
    </div>
  );
};

const LoginPage = () => (
  <Suspense>
    <LoginForm />
  </Suspense>
);

export default LoginPage;
