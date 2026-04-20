'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/Loading';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        throw signInError;
      }

      if (data.user) {
        // Redirect based on role will be handled by middleware
        router.push('/dashboard/paket-masuk');
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Gagal login. Periksa email dan password Anda.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Package Tracking
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Sistem Tracking Paket & Makanan
          </p>
        </div>

        {/* Login Form */}
        <div className="mt-8 bg-white py-8 px-6 shadow rounded-lg">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Login</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@contoh.com"
              required
              disabled={loading}
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
            />

            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={loading}
              disabled={loading}
            >
              {loading ? 'Memproses...' : 'Login'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-gray-600">
            <p>Hubungi administrator untuk membuat akun.</p>
          </div>
        </div>

        {/* Public Tracking Link */}
        <div className="text-center">
          <a
            href="/tracking"
            className="text-sm text-blue-600 hover:text-blue-500"
          >
            Lacak paket tanpa login →
          </a>
        </div>
      </div>
    </div>
  );
}
