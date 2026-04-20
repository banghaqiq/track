'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { QRScanner } from '@/components/scanner/QRScanner';
import { Modal } from '@/components/ui/Modal';
import type { Package } from '@/types';

interface PaketMasukFormProps {
  onSuccess?: () => void;
}

export function PaketMasukForm({ onSuccess }: PaketMasukFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  
  const [formData, setFormData] = useState({
    resi: '',
    package_name: '',
    region: '',
    is_family_guardian: false,
    is_no_region: false,
  });

  const handleScanSuccess = (decodedText: string) => {
    setFormData(prev => ({ ...prev, resi: decodedText }));
    setShowScanner(false);
  };

  const validateResiUnique = async (resi: string): Promise<boolean> => {
    const supabase = createBrowserSupabaseClient();
    
    const { data, error } = await supabase
      .from('packages')
      .select('id')
      .eq('resi', resi)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      throw error;
    }

    return !data; // Return true if unique (not found)
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Validate resi uniqueness
      const isUnique = await validateResiUnique(formData.resi);
      if (!isUnique) {
        throw new Error('Nomor resi sudah terdaftar. Gunakan nomor resi yang unik.');
      }

      const supabase = createBrowserSupabaseClient();
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error('User tidak terautentikasi');
      }

      // Insert package - timestamp will be handled by database trigger
      const { error: insertError } = await supabase
        .from('packages')
        .insert({
          resi: formData.resi.trim(),
          package_name: formData.package_name.trim(),
          region: formData.region.trim() || null,
          is_family_guardian: formData.is_family_guardian,
          is_no_region: formData.is_no_region,
          status: 'incoming',
          created_by: user.id,
          updated_by: user.id,
        });

      if (insertError) {
        throw insertError;
      }

      // Reset form
      setFormData({
        resi: '',
        package_name: '',
        region: '',
        is_family_guardian: false,
        is_no_region: false,
      });

      // Show success message
      alert('Paket berhasil ditambahkan!');
      
      if (onSuccess) {
        onSuccess();
      } else {
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || 'Gagal menambahkan paket');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  return (
    <>
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          Input Paket Masuk
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Resi Field with Scanner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nomor Resi <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                name="resi"
                value={formData.resi}
                onChange={handleChange}
                placeholder="Scan atau masukkan nomor resi"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={loading}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setShowScanner(true)}
                disabled={loading}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Button>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Resi harus unik untuk setiap paket
            </p>
          </div>

          {/* Package Name */}
          <Input
            label="Nama Paket / Konten"
            name="package_name"
            value={formData.package_name}
            onChange={handleChange}
            placeholder="Contoh: Makanan, Sembako, dll"
            required
            disabled={loading}
          />

          {/* Region */}
          <Input
            label="Wilayah Tujuan (Opsional)"
            name="region"
            value={formData.region}
            onChange={handleChange}
            placeholder="Contoh: Jakarta, Bandung, dll"
            disabled={loading}
          />

          {/* Category Checkboxes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Kategori
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="is_family_guardian"
                  checked={formData.is_family_guardian}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={loading}
                />
                <span className="ml-2 text-sm text-gray-700">Keluarga Pengasuh</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  name="is_no_region"
                  checked={formData.is_no_region}
                  onChange={handleChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  disabled={loading}
                />
                <span className="ml-2 text-sm text-gray-700">Tanpa Wilayah</span>
              </label>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Boleh memilih salah satu, keduanya, atau tidak sama sekali
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <Button
              type="submit"
              variant="primary"
              isLoading={loading}
              disabled={loading}
            >
              Simpan Paket
            </Button>
          </div>
        </form>
      </div>

      {/* QR Scanner Modal */}
      <Modal
        isOpen={showScanner}
        onClose={() => setShowScanner(false)}
        title="Scan QR Code Resi"
        size="md"
      >
        <QRScanner
          onScanSuccess={handleScanSuccess}
          onScanError={(err) => console.log('Scan error:', err)}
        />
      </Modal>
    </>
  );
}
