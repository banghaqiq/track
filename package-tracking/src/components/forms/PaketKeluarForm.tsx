'use client';

import React, { useState } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import type { Package, PackageStatus } from '@/types';
import { STATUS_LABELS } from '@/types';

interface PaketKeluarFormProps {
  packageData: Package;
  onSuccess?: () => void;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { value: 'dispatched', label: 'Dikirim' },
  { value: 'picked_up', label: 'Diambil' },
  { value: 'completed', label: 'Selesai' },
];

export function PaketKeluarForm({ packageData, onSuccess, onClose }: PaketKeluarFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    status: packageData.status,
    recipient_name: packageData.recipient_name || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const supabase = createBrowserSupabaseClient();
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User tidak terautentikasi');
      }

      // Update package
      const { error: updateError } = await supabase
        .from('packages')
        .update({
          status: formData.status,
          recipient_name: formData.recipient_name.trim() || null,
          updated_by: user.id,
        })
        .eq('id', packageData.id);

      if (updateError) {
        throw updateError;
      }

      alert('Status paket berhasil diupdate!');
      
      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Gagal mengupdate status paket');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Package Info */}
      <div className="bg-gray-50 p-4 rounded-md">
        <p className="text-sm font-medium text-gray-900">Resi: {packageData.resi}</p>
        <p className="text-sm text-gray-600">{packageData.package_name}</p>
        <p className="text-xs text-gray-500 mt-1">
          Status saat ini: <span className="font-medium">{STATUS_LABELS[packageData.status]}</span>
        </p>
      </div>

      {/* Status Selection */}
      <Select
        label="Status Baru"
        value={formData.status}
        onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value as PackageStatus }))}
        options={STATUS_OPTIONS}
        required
        disabled={loading}
      />

      {/* Recipient Name */}
      <Input
        label="Nama Pengambil"
        value={formData.recipient_name}
        onChange={(e) => setFormData(prev => ({ ...prev, recipient_name: e.target.value }))}
        placeholder="Masukkan nama yang mengambil paket"
        disabled={loading}
        helperText="Wajib diisi jika status diubah menjadi 'Diambil'"
      />

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={onClose}
          disabled={loading}
        >
          Batal
        </Button>
        <Button
          type="submit"
          variant="primary"
          isLoading={loading}
          disabled={loading}
        >
          Simpan Perubahan
        </Button>
      </div>
    </form>
  );
}
