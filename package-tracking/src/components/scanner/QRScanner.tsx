'use client';

import React, { useState, useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (error: any) => void;
  className?: string;
}

export function QRScanner({ onScanSuccess, onScanError, className = '' }: QRScannerProps) {
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const scannerRef = React.useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    // Initialize scanner
    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
        disableFlip: false,
      },
      /* verbose= */ false
    );

    scannerRef.current = scanner;

    const onScanSuccessCallback = (decodedText: string) => {
      setScanResult(decodedText);
      setIsScanning(false);
      onScanSuccess(decodedText);
      // Clear scanner after successful scan
      scanner.clear();
    };

    const onScanErrorCallback = (error: any) => {
      // Ignore scanning errors (they happen frequently during normal operation)
      if (onScanError) {
        onScanError(error);
      }
    };

    scanner.render(onScanSuccessCallback, onScanErrorCallback);

    return () => {
      // Cleanup scanner on unmount
      if (scannerRef.current) {
        scannerRef.current.clear().catch((err) => {
          console.error('Failed to clear scanner:', err);
        });
      }
    };
  }, [onScanSuccess, onScanError]);

  const handleManualInput = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const manualResi = formData.get('resi') as string;
    
    if (manualResi.trim()) {
      setScanResult(manualResi.trim());
      onScanSuccess(manualResi.trim());
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="border rounded-lg p-4 bg-white">
        <div id="qr-reader" className="w-full max-w-md mx-auto"></div>
      </div>

      {/* Fallback: Manual Input */}
      <div className="border-t pt-4">
        <p className="text-sm text-gray-600 mb-2">
          Atau masukkan resi secara manual:
        </p>
        <form onSubmit={handleManualInput} className="flex gap-2">
          <input
            type="text"
            name="resi"
            placeholder="Masukkan nomor resi"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Cari
          </button>
        </form>
      </div>

      {scanResult && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
          <p className="text-sm text-green-800">
            <span className="font-semibold">Resi terdeteksi:</span> {scanResult}
          </p>
        </div>
      )}
    </div>
  );
}
