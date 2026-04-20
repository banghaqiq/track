export type UserRole = 'admin' | 'user';

export type PackageStatus = 'incoming' | 'dispatched' | 'picked_up' | 'completed';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface Package {
  id: string;
  resi: string;
  package_name: string;
  region: string | null;
  is_family_guardian: boolean;
  is_no_region: boolean;
  status: PackageStatus;
  recipient_name: string | null;
  created_by: string;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StatusLog {
  id: string;
  package_id: string;
  old_status: PackageStatus | null;
  new_status: PackageStatus;
  changed_by: string;
  changed_at: string;
  note: string | null;
}

export interface PackageWithLogs extends Package {
  status_logs?: StatusLog[];
}

export interface FilterOptions {
  status?: PackageStatus;
  region?: string;
  is_family_guardian?: boolean;
  is_no_region?: boolean;
  date_from?: string;
  date_to?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
  success: boolean;
}

export interface TablePaginationState {
  pageIndex: number;
  pageSize: number;
}

export const STATUS_LABELS: Record<PackageStatus, string> = {
  incoming: 'Paket Masuk',
  dispatched: 'Dikirim',
  picked_up: 'Diambil',
  completed: 'Selesai',
};

export const STATUS_COLORS: Record<PackageStatus, string> = {
  incoming: 'bg-blue-100 text-blue-800',
  dispatched: 'bg-yellow-100 text-yellow-800',
  picked_up: 'bg-purple-100 text-purple-800',
  completed: 'bg-green-100 text-green-800',
};
