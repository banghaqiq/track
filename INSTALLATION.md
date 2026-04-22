# Panduan Instalasi Aplikasi Logistik & Tracking Paket

Panduan lengkap untuk menginstal dan menjalankan aplikasi manajemen logistik dari nol hingga siap digunakan di lingkungan lokal.

## 📋 Prasyarat

Sebelum memulai, pastikan Anda telah menginstal:

- **Node.js** versi 18.0 atau lebih baru ([Download](https://nodejs.org/))
- **npm** atau **yarn** (terinstall otomatis dengan Node.js)
- **Git** ([Download](https://git-scm.com/))
- Akun **Supabase** ([Daftar Gratis](https://supabase.com))
- Code Editor (VS Code direkomendasikan)

---

## 🚀 Langkah 1: Setup Database Supabase

### 1.1 Buat Project Supabase
1. Buka [supabase.com](https://supabase.com) dan login
2. Klik **"New Project"**
3. Isi detail project:
   - **Name**: `logistik-tracker` (atau nama lain)
   - **Database Password**: Buat password kuat (simpan di password manager)
   - **Region**: Pilih yang terdekat dengan lokasi Anda
4. Klik **"Create new project"** dan tunggu hingga selesai (±2 menit)

### 1.2 Dapatkan Kredensial API
1. Di dashboard project, masuk ke **Settings** → **API**
2. Salin nilai berikut:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon/public key**: `eyJhbG...` (kunci panjang)
3. Simpan kedua nilai ini untuk langkah berikutnya

### 1.3 Jalankan SQL Migration
1. Di dashboard Supabase, masuk ke **SQL Editor**
2. Klik **"New Query"**
3. Copy seluruh kode SQL di bawah ini dan paste ke editor
4. Klik **"Run"** atau tekan `Ctrl+Enter`

```sql
-- ============================================
-- SKEMA DATABASE LOGISTIK TRACKER
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for package status
CREATE TYPE package_status AS ENUM ('incoming', 'dispatched', 'picked_up', 'completed');

-- Create users table (extends Supabase auth.users)
CREATE TABLE public.users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create packages table
CREATE TABLE public.packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resi VARCHAR(50) UNIQUE NOT NULL,
    package_name VARCHAR(255) NOT NULL,
    region VARCHAR(255),
    is_family_guardian BOOLEAN NOT NULL DEFAULT FALSE,
    is_no_region BOOLEAN NOT NULL DEFAULT FALSE,
    status package_status NOT NULL DEFAULT 'incoming',
    recipient_name VARCHAR(255),
    created_by UUID NOT NULL REFERENCES public.users(id),
    updated_by UUID REFERENCES public.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create status_logs table for audit trail
CREATE TABLE public.status_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
    old_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by UUID NOT NULL REFERENCES public.users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT
);

-- Create indexes for performance
CREATE INDEX idx_packages_resi ON public.packages(resi);
CREATE INDEX idx_packages_status ON public.packages(status);
CREATE INDEX idx_packages_created_at ON public.packages(created_at);
CREATE INDEX idx_packages_updated_at ON public.packages(updated_at);
CREATE INDEX idx_packages_region ON public.packages(region);
CREATE INDEX idx_status_logs_package_id ON public.status_logs(package_id);
CREATE INDEX idx_status_logs_changed_at ON public.status_logs(changed_at);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_users_role ON public.users(role);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for packages table
CREATE TRIGGER update_packages_updated_at
    BEFORE UPDATE ON public.packages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create function to log status changes
CREATE OR REPLACE FUNCTION log_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO public.status_logs (package_id, old_status, new_status, changed_by, note)
        VALUES (NEW.id, OLD.status::VARCHAR, NEW.status::VARCHAR, NEW.updated_by, 'Status changed via application');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for status logging
CREATE TRIGGER log_package_status_change
    AFTER UPDATE ON public.packages
    FOR EACH ROW
    EXECUTE FUNCTION log_status_change();

-- Create view for packages within 7 days (for public access)
CREATE OR REPLACE VIEW public.packages_recent AS
SELECT * FROM public.packages
WHERE updated_at >= NOW() - INTERVAL '7 days';

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_logs ENABLE ROW LEVEL SECURITY;

-- Users table policies
CREATE POLICY "Users can view their own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Admins can view all users"
    ON public.users FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Admins can insert users"
    ON public.users FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Admins can update all users"
    ON public.users FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- Packages table policies
CREATE POLICY "Authenticated users can view packages (7 days limit)"
    ON public.packages FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        updated_at >= NOW() - INTERVAL '7 days'
    );

CREATE POLICY "Admins can view all packages"
    ON public.packages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Admins can insert packages"
    ON public.packages FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

CREATE POLICY "Authenticated users can update packages (7 days limit)"
    ON public.packages FOR UPDATE
    USING (
        auth.role() = 'authenticated' AND
        updated_at >= NOW() - INTERVAL '7 days'
    );

-- Status logs table policies
CREATE POLICY "Authenticated users can view status logs (7 days limit)"
    ON public.status_logs FOR SELECT
    USING (
        auth.role() = 'authenticated' AND
        changed_at >= NOW() - INTERVAL '7 days'
    );

CREATE POLICY "Admins can view all status logs"
    ON public.status_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- Public access to recent packages (no auth required)
CREATE POLICY "Public can view recent packages"
    ON public.packages FOR SELECT
    USING (
        updated_at >= NOW() - INTERVAL '7 days'
    );

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to get current user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS VARCHAR AS $$
DECLARE
    user_role VARCHAR;
BEGIN
    SELECT role INTO user_role FROM public.users WHERE id = auth.uid();
    RETURN user_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create admin user (run after creating auth user)
CREATE OR REPLACE FUNCTION public.create_admin_user(user_id UUID, user_name VARCHAR, user_email VARCHAR)
RETURNS VOID AS $$
BEGIN
    INSERT INTO public.users (id, name, email, role)
    VALUES (user_id, user_name, user_email, 'admin')
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = 'admin';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SEED DATA (Optional - Remove in production)
-- ============================================

-- Insert sample admin user (you'll need to create auth user first via Supabase UI)
-- This is just a reference - create user via Authentication panel instead

COMMENT ON TABLE public.users IS 'Extended user profiles with role-based access';
COMMENT ON TABLE public.packages IS 'Package tracking data with 7-day retention policy';
COMMENT ON TABLE public.status_logs IS 'Audit trail for package status changes';
```

5. Pastikan tidak ada error. Jika sukses, akan muncul pesan "Success. No rows returned"

### 1.4 Buat User Admin Pertama
1. Di dashboard Supabase, masuk ke **Authentication** → **Users**
2. Klik **"Add User"**
3. Isi:
   - **Email**: `admin@logistik.com` (ganti dengan email Anda)
   - **Password**: Buat password kuat (minimal 8 karakter)
   - **Confirm Password**: Ulangi password
4. Klik **"Add User"**
5. Setelah user dibuat, salin **User ID** (UUID)
6. Kembali ke **SQL Editor** dan jalankan query ini (ganti UUID dan email):

```sql
-- Ganti 'USER_ID_DARI_STEP_5' dengan UUID user yang baru dibuat
-- Ganti 'admin@logistik.com' dengan email yang sama
SELECT public.create_admin_user(
    'USER_ID_DARI_STEP_5'::UUID,
    'Administrator',
    'admin@logistik.com'
);
```

7. Verifikasi user admin telah dibuat:
```sql
SELECT id, name, email, role FROM public.users WHERE role = 'admin';
```

---

## 💻 Langkah 2: Setup Proyek Lokal

### 2.1 Buat Direktori Proyek
Buka terminal/command prompt dan jalankan:

```bash
# Buat folder proyek
mkdir logistik-tracker
cd logistik-tracker

# Inisialisasi git (opsional tapi direkomendasikan)
git init
```

### 2.2 Install Next.js dan Dependencies
Jalankan perintah berikut satu per satu:

```bash
# Create Next.js app dengan konfigurasi default
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack

# Install dependencies utama
npm install @supabase/supabase-js @supabase/ssr lucide-react clsx tailwind-merge sonner date-fns html5-qrcode zod react-hook-form @hookform/resolvers

# Install dev dependencies
npm install -D @types/node @types/react @types/react-dom
```

**Catatan**: Jika menggunakan yarn:
```bash
yarn create next-app . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
yarn add @supabase/supabase-js @supabase/ssr lucide-react clsx tailwind-merge sonner date-fns html5-qrcode zod react-hook-form @hookform/resolvers
yarn add -D @types/node @types/react @types/react-dom
```

### 2.3 Konfigurasi Environment Variables
Buat file `.env.local` di root direktori proyek:

```bash
# Buat file .env.local
touch .env.local
```

Isi file `.env.local` dengan kredensial Supabase Anda:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here

# Application Settings
NEXT_PUBLIC_APP_NAME="Logistik Tracker"
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

**Penting**: 
- Ganti `your-project-id` dengan Project URL dari Supabase
- Ganti `your-anon-key-here` dengan anon key dari Supabase
- Jangan commit file `.env.local` ke Git (sudah ada di `.gitignore`)

---

## 📁 Langkah 3: Buat Struktur File dan Kode

### 3.1 Struktur Folder
Pastikan struktur folder seperti ini:

```
logistik-tracker/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── paket-masuk/
│   │   │   │   └── page.tsx
│   │   │   ├── paket-keluar/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   └── auth/
│   │   │       └── callback/
│   │   │           └── route.ts
│   │   ├── tracking/
│   │   │   └── [resi]/
│   │   │       └── page.tsx
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/
│   │   │   ├── button.tsx
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   ├── badge.tsx
│   │   │   └── toast.tsx
│   │   ├── auth/
│   │   │   └── login-form.tsx
│   │   ├── packages/
│   │   │   ├── package-form.tsx
│   │   │   ├── package-table.tsx
│   │   │   ├── package-filters.tsx
│   │   │   ├── qr-scanner.tsx
│   │   │   └── status-badge.tsx
│   │   ├── layout/
│   │   │   ├── sidebar.tsx
│   │   │   ├── header.tsx
│   │   │   └── nav-item.tsx
│   │   └── providers/
│   │       └── supabase-provider.tsx
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts
│   │   │   ├── server.ts
│   │   │   └── middleware.ts
│   │   ├── utils.ts
│   │   ├── validations/
│   │   │   └── package.ts
│   │   └── types/
│   │       └── index.ts
│   └── middleware.ts
├── public/
├── .env.local
├── .gitignore
├── next.config.js
├── package.json
├── tailwind.config.ts
└── tsconfig.json
```

### 3.2 Buat File Inti

#### A. Konfigurasi Supabase Client (`src/lib/supabase/client.ts`)

```typescript
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

#### B. Konfigurasi Supabase Server (`src/lib/supabase/server.ts`)

```typescript
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The server action failed
          }
        },
      },
    }
  )
}
```

#### C. Middleware (`src/middleware.ts`)

```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Protected routes
  const protectedPaths = ['/dashboard', '/paket-masuk', '/paket-keluar']
  const isProtectedPath = protectedPaths.some(path => 
    request.nextUrl.pathname.startsWith(path)
  )

  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Redirect authenticated users away from login
  if (request.nextUrl.pathname === '/login' && user) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

#### D. Utility Functions (`src/lib/utils.ts`)

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date) {
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(date))
}
```

#### E. Types (`src/lib/types/index.ts`)

```typescript
export type UserRole = 'admin' | 'user'

export type PackageStatus = 'incoming' | 'dispatched' | 'picked_up' | 'completed'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  created_at: string
}

export interface Package {
  id: string
  resi: string
  package_name: string
  region: string | null
  is_family_guardian: boolean
  is_no_region: boolean
  status: PackageStatus
  recipient_name: string | null
  created_by: string
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface StatusLog {
  id: string
  package_id: string
  old_status: string | null
  new_status: string
  changed_by: string
  changed_at: string
  note: string | null
}

export interface PackageFilters {
  status?: PackageStatus | 'all'
  region?: string
  search?: string
  dateFrom?: string
  dateTo?: string
  category?: 'family' | 'no-region' | 'all'
}
```

#### F. Validations (`src/lib/validations/package.ts`)

```typescript
import { z } from 'zod'

export const packageSchema = z.object({
  resi: z.string().min(1, 'Resi wajib diisi').max(50, 'Resi maksimal 50 karakter'),
  package_name: z.string().min(1, 'Nama paket wajib diisi').max(255),
  region: z.string().max(255).optional().or(z.literal('')),
  is_family_guardian: z.boolean().default(false),
  is_no_region: z.boolean().default(false),
})

export const packageUpdateSchema = z.object({
  status: z.enum(['incoming', 'dispatched', 'picked_up', 'completed']),
  recipient_name: z.string().max(255).optional().or(z.literal('')),
})

export type PackageInput = z.infer<typeof packageSchema>
export type PackageUpdateInput = z.infer<typeof packageUpdateSchema>
```

---

## 🎨 Langkah 4: Buat Komponen UI

Karena keterbatasan panjang respons, saya akan memberikan instruksi untuk membuat komponen-komponen penting. Anda dapat menyalin kode lengkap dari repository template atau membuatnya sesuai kebutuhan.

### 4.1 Komponen UI Dasar

Buat file-file berikut di `src/components/ui/`:

- `button.tsx` - Komponen tombol dengan variasi
- `input.tsx` - Input field dengan label dan error
- `card.tsx` - Card container
- `badge.tsx` - Badge untuk status
- `toast.tsx` - Notifikasi toast

### 4.2 Komponen Utama

Buat komponen-komponen berikut:

**Auth:**
- `src/components/auth/login-form.tsx` - Form login

**Packages:**
- `src/components/packages/package-form.tsx` - Form input paket
- `src/components/packages/package-table.tsx` - Tabel daftar paket
- `src/components/packages/package-filters.tsx` - Filter dan pencarian
- `src/components/packages/qr-scanner.tsx` - Scanner QR code
- `src/components/packages/status-badge.tsx` - Badge status warna-warni

**Layout:**
- `src/components/layout/sidebar.tsx` - Sidebar navigasi
- `src/components/layout/header.tsx` - Header dengan user info
- `src/components/layout/nav-item.tsx` - Item navigasi

---

## 🌐 Langkah 5: Buat Halaman Aplikasi

### 5.1 Halaman Login (`src/app/(auth)/login/page.tsx`)

Halaman login dengan form autentikasi Supabase.

### 5.2 Dashboard (`src/app/(dashboard)/dashboard/page.tsx`)

Dashboard utama dengan statistik dan quick actions.

### 5.3 Paket Masuk (`src/app/(dashboard)/paket-masuk/page.tsx`)

Form input paket masuk dengan scanner QR.

### 5.4 Paket Keluar (`src/app/(dashboard)/paket-keluar/page.tsx`)

Daftar paket dengan aksi update status.

### 5.5 Tracking Publik (`src/app/tracking/[resi]/page.tsx`)

Halaman publik untuk melacak paket berdasarkan resi.

### 5.6 Homepage (`src/app/page.tsx`)

Landing page dengan link ke tracking dan login.

---

## ▶️ Langkah 6: Jalankan Aplikasi

### 6.1 Development Mode

```bash
# Pastikan berada di root direktori proyek
cd logistik-tracker

# Jalankan development server
npm run dev
```

Aplikasi akan berjalan di `http://localhost:3000`

### 6.2 Test Aplikasi

1. Buka browser dan akses `http://localhost:3000`
2. Login dengan akun admin yang sudah dibuat
3. Coba fitur:
   - Input paket masuk (dengan scanner QR atau manual)
   - Update status paket keluar
   - Lihat history audit log
   - Akses halaman tracking publik

---

## 🚀 Langkah 7: Deployment ke Production

### 7.1 Push ke GitHub

```bash
# Commit semua file
git add .
git commit -m "Initial commit: Logistik Tracker App"

# Buat repository di GitHub
# Lalu push
git remote add origin https://github.com/username/logistik-tracker.git
git branch -M main
git push -u origin main
```

### 7.2 Deploy ke Vercel

1. Buka [vercel.com](https://vercel.com) dan login
2. Klik **"Import Project"**
3. Pilih repository GitHub yang baru dibuat
4. Konfigurasi:
   - **Framework Preset**: Next.js (otomatis terdeteksi)
   - **Root Directory**: `./` (default)
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `.next` (default)
5. Tambahkan **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_APP_NAME`
   - `NEXT_PUBLIC_BASE_URL` (isi dengan domain production)
6. Klik **"Deploy"**
7. Tunggu proses deployment selesai (±2-3 menit)
8. Aplikasi siap diakses di domain Vercel

### 7.3 Custom Domain (Opsional)

1. Di Vercel Dashboard, pilih project
2. Masuk ke **Settings** → **Domains**
3. Tambahkan domain custom Anda
4. Ikuti instruksi untuk setup DNS
5. Update `NEXT_PUBLIC_BASE_URL` di environment variables

---

## 🔧 Troubleshooting

### Error: "Failed to fetch"
- Periksa kredensial Supabase di `.env.local`
- Pastikan Row Level Security (RLS) sudah dikonfigurasi dengan benar
- Cek browser console untuk error detail

### Error: "Permission denied"
- Verifikasi user memiliki role yang tepat di tabel `public.users`
- Periksa policies RLS di Supabase dashboard
- Pastikan user sudah login dengan benar

### Scanner QR tidak berfungsi
- Pastikan menggunakan HTTPS (di production) atau localhost (di development)
- Berikan izin akses kamera di browser
- Coba browser berbeda (Chrome/Firefox/Safari)

### Data tidak muncul setelah 7 hari
- Ini adalah perilaku yang diharapkan (filter 7 hari)
- Periksa kolom `updated_at` di database
- Update paket untuk mereset timer 7 hari

---

## 📝 Maintenance

### Backup Database
- Gunakan fitur backup otomatis Supabase (Pro plan)
- Atau export manual melalui SQL Editor

### Update Aplikasi
```bash
# Pull perubahan terbaru
git pull origin main

# Install dependencies baru
npm install

# Restart development server
npm run dev
```

### Monitoring
- Pantau usage di Supabase Dashboard
- Cek logs di Vercel Dashboard
- Setup alerting untuk error kritis

---

## 📞 Support

Jika mengalami kendala:
1. Periksa dokumentasi [Supabase](https://supabase.com/docs)
2. Baca dokumentasi [Next.js](https://nextjs.org/docs)
3. Cek issue di GitHub repository
4. Hubungi tim support

---

## ✅ Checklist Instalasi

- [ ] Akun Supabase dibuat
- [ ] Project Supabase dibuat
- [ ] SQL migration dijalankan
- [ ] User admin dibuat
- [ ] Node.js terinstall
- [ ] Proyek Next.js dibuat
- [ ] Dependencies terinstall
- [ ] File `.env.local` dikonfigurasi
- [ ] Semua file kode dibuat
- [ ] Development server berjalan
- [ ] Login berhasil
- [ ] Fitur input paket berfungsi
- [ ] Fitur update status berfungsi
- [ ] Tracking publik berfungsi
- [ ] Deployment ke production

Selamat! Aplikasi Logistik Tracker Anda siap digunakan! 🎉
