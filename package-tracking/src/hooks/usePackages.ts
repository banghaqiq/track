'use client';

import { useState, useEffect, useCallback } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { Package, FilterOptions, PackageStatus } from '@/types';

interface UsePackagesReturn {
  packages: Package[];
  loading: boolean;
  error: string | null;
  totalCount: number;
  refreshPackages: () => Promise<void>;
  updatePackageStatus: (packageId: string, status: PackageStatus, recipientName?: string) => Promise<boolean>;
}

export function usePackages(filters?: FilterOptions): UsePackagesReturn {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  
  const supabase = createBrowserSupabaseClient();

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('packages')
        .select('*', { count: 'exact' })
        .order('updated_at', { ascending: false });

      // Apply filters
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.region) {
        query = query.eq('region', filters.region);
      }

      if (filters?.is_family_guardian !== undefined) {
        query = query.eq('is_family_guardian', filters.is_family_guardian);
      }

      if (filters?.is_no_region !== undefined) {
        query = query.eq('is_no_region', filters.is_no_region);
      }

      if (filters?.date_from) {
        query = query.gte('created_at', filters.date_from);
      }

      if (filters?.date_to) {
        query = query.lte('created_at', filters.date_to);
      }

      if (filters?.search) {
        // Search in resi and package_name
        query = query.or(`resi.ilike.%${filters.search}%,package_name.ilike.%${filters.search}%`);
      }

      // Pagination
      const page = filters?.page || 1;
      const limit = filters?.limit || 10;
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      query = query.range(from, to);

      const { data, error: fetchError, count } = await query;

      if (fetchError) {
        throw fetchError;
      }

      setPackages(data || []);
      setTotalCount(count || 0);
    } catch (err: any) {
      setError(err.message || 'Gagal mengambil data paket');
      console.error('Error fetching packages:', err);
    } finally {
      setLoading(false);
    }
  }, [filters, supabase]);

  const updatePackageStatus = async (
    packageId: string,
    status: PackageStatus,
    recipientName?: string
  ): Promise<boolean> => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User tidak terautentikasi');
      }

      // Update package
      const updateData: any = {
        status,
        updated_by: user.id,
      };

      if (recipientName !== undefined) {
        updateData.recipient_name = recipientName;
      }

      const { error: updateError } = await supabase
        .from('packages')
        .update(updateData)
        .eq('id', packageId);

      if (updateError) {
        throw updateError;
      }

      // Refresh packages
      await fetchPackages();
      return true;
    } catch (err: any) {
      setError(err.message || 'Gagal mengupdate status paket');
      console.error('Error updating package:', err);
      return false;
    }
  };

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // Real-time subscription
  useEffect(() => {
    const channel = supabase
      .channel('packages-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'packages',
        },
        () => {
          // Refresh on any change
          fetchPackages();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPackages, supabase]);

  return {
    packages,
    loading,
    error,
    totalCount,
    refreshPackages: fetchPackages,
    updatePackageStatus,
  };
}
