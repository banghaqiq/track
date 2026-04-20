# Aplikasi Tracking Paket - Dokumentasi Lengkap

## 📋 Arsitektur Sistem

### Tech Stack
- **Frontend**: Next.js 14 (App Router) + React + TypeScript + Tailwind CSS
- **Backend/DB**: Supabase (PostgreSQL, Auth, Row-Level Security, Realtime)
- **QR Scanner**: html5-qrcode
- **Deployment**: Vercel (FE) + Supabase (BE)

### Struktur Folder Proyek
```
package-tracking/
├── src/
│   ├── app/
│   │   ├── auth/
│   │   │   └── login/
│   │   │       └── page.tsx          # Halaman Login
│   │   ├── dashboard/
│   │   │   ├── paket-masuk/
│   │   │   │   └── page.tsx          # Input Paket Masuk (Admin only)
│   │   │   ├── paket-keluar/
│   │   │   │   └── page.tsx          # Paket Keluar (User & Admin)
│   │   │   ├── data-paket/
│   │   │   │   └── page.tsx          # Tabel Data & Filter
│   │   │   └── layout.tsx            # Dashboard Layout dengan Auth Guard
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── logout/
│   │   │   │       └── route.ts      # Logout API
│   │   │   └── packages/
│   │   │       └── route.ts          # Package API endpoints
│   │   ├── tracking/
│   │   │   └── page.tsx              # Public Tracking Page
│   │   ├── layout.tsx                # Root Layout
│   │   └── page.tsx                  # Home Page (redirect to tracking/login)
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── Loading.tsx
│   │   ├── scanner/
│   │   │   └── QRScanner.tsx         # Component QR Scanner
│   │   ├── forms/
│   │   │   ├── PaketMasukForm.tsx
│   │   │   ├── PaketKeluarForm.tsx
│   │   │   └── LoginForm.tsx
│   │   └── tables/
│   │       └── PackageTable.tsx      # Table dengan Filter & Pagination
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Supabase Client (browser)
│   │   │   ├── server.ts             # Supabase Client (server)
│   │   │   └── middleware.ts         # Supabase Middleware helper
│   │   ├── utils.ts                  # Helper functions
│   │   └── validations.ts            # Zod schemas
│   ├── hooks/
│   │   ├── useAuth.ts                # Auth state hook
│   │   └── usePackages.ts            # Packages data hook
│   ├── types/
│   │   └── index.ts                  # TypeScript types
│   └── middleware.ts                 # Next.js Middleware untuk Auth
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql    # Database schema & RLS policies
├── public/
├── .env.local.example
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## 🗄️ Skema Database (PostgreSQL/Supabase)

### Tabel & Relasi

#### 1. `users`
Menyimpan data pengguna dengan role-based access.

```sql
- id: uuid (primary key, default gen_random_uuid())
- name: varchar(255) not null
- email: varchar(255) unique not null
- password_hash: varchar(255) not null
- role: varchar(10) not null check (role in ('admin', 'user'))
- created_at: timestamptz default now()
```

#### 2. `packages`
Menyimpan data paket dengan status tracking.

```sql
- id: uuid (primary key)
- resi: varchar(50) unique not null
- package_name: varchar(255) not null
- region: varchar(255) nullable
- is_family_guardian: boolean default false
- is_no_region: boolean default false
- status: varchar(20) not null check (status in ('incoming', 'dispatched', 'picked_up', 'completed'))
- recipient_name: varchar(255) nullable
- created_by: uuid (foreign key -> users.id)
- updated_by: uuid (foreign key -> users.id)
- created_at: timestamptz default now()
- updated_at: timestamptz default now()
```

#### 3. `status_logs`
Audit trail untuk setiap perubahan status.

```sql
- id: uuid (primary key)
- package_id: uuid (foreign key -> packages.id on delete cascade)
- old_status: varchar(20) nullable
- new_status: varchar(20) not null
- changed_by: uuid (foreign key -> users.id)
- changed_at: timestamptz default now()
- note: text nullable
```

### Index & Constraints
- `packages.resi`: unique index untuk validasi unik
- `packages.status`, `packages.created_at`, `packages.updated_at`: index untuk filter
- `status_logs.package_id`, `status_logs.changed_at`: index untuk query audit
- Foreign keys dengan ON DELETE CASCADE untuk status_logs
- Check constraints untuk enum values

### Row-Level Security (RLS) Policies
- **Admin**: Full access ke semua tabel
- **User**: Read packages (7 hari terakhir), Update status packages, Insert status_logs
- **Public**: Read-only packages (7 hari terakhir) via specific policy

## 🔐 Business Rules & Validasi

1. **Resi Unik**: Validasi di database level dengan UNIQUE constraint
2. **Timestamp Server**: Semua timestamp menggunakan `now()` dari PostgreSQL
3. **Batas 7 Hari**: Query filter `WHERE updated_at >= NOW() - INTERVAL '7 days'`
4. **Role Access**:
   - Admin: Akses semua menu dan operasi
   - User: Hanya Paket Keluar, ubah status, input nama pengambil
5. **Audit Trail**: Setiap perubahan status wajib mencatat old_status, new_status, changed_by, changed_at

## 🚀 Panduan Setup & Deployment

### Prerequisites
- Node.js 18+
- Supabase account (free tier cukup)
- Vercel account (untuk deployment)

### Langkah Setup

#### 1. Clone & Install Dependencies
```bash
cd package-tracking
npm install
```

#### 2. Setup Supabase
1. Buat project baru di https://supabase.com
2. Jalankan migration SQL di folder `supabase/migrations/001_initial_schema.sql`
3. Dapatkan credentials dari Settings > API

#### 3. Environment Variables
Buat file `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

#### 4. Development
```bash
npm run dev
```

#### 5. Deployment ke Vercel
1. Push code ke GitHub
2. Connect repository di Vercel
3. Set environment variables di Vercel dashboard
4. Deploy

## ⚠️ Catatan Keamanan

1. **RLS Policies**: Wajib diaktifkan untuk semua tabel
2. **Server-Side Validation**: Semua validasi dilakukan di server
3. **No Hardcoded Secrets**: Gunakan environment variables
4. **Session Management**: Menggunakan Supabase Auth cookies
5. **Input Sanitization**: Escape semua user input
6. **Rate Limiting**: Implementasi di production jika diperlukan

## 📝 Error Handling Best Practices

1. **Loading States**: Tampilkan skeleton/loading saat fetch data
2. **Error Boundaries**: Catch errors di component level
3. **User-Friendly Messages**: Jangan expose error teknis ke user
4. **Retry Logic**: Auto-retry untuk transient failures
5. **Logging**: Log errors untuk debugging
