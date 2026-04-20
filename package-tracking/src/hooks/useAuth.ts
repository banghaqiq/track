import { createBrowserSupabaseClient } from './supabase/client';
import type { User, UserRole } from '@/types';

export async function getCurrentUser(): Promise<User | null> {
  const supabase = createBrowserSupabaseClient();
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return null;
    }

    const { data: userData, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', session.user.id)
      .single();

    if (error || !userData) {
      return null;
    }

    return userData as User;
  } catch (error) {
    console.error('Error getting current user:', error);
    return null;
  }
}

export async function checkUserRole(): Promise<UserRole | null> {
  const user = await getCurrentUser();
  return user?.role || null;
}

export async function isAdmin(): Promise<boolean> {
  const role = await checkUserRole();
  return role === 'admin';
}

export async function logout() {
  const supabase = createBrowserSupabaseClient();
  await supabase.auth.signOut();
  window.location.href = '/auth/login';
}
