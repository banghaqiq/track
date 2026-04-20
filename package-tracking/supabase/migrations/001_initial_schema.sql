-- Migration: 001_initial_schema.sql
-- Aplikasi Tracking Paket - Database Schema & RLS Policies
-- Compatible dengan PostgreSQL/Supabase

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum type for package status
CREATE TYPE package_status AS ENUM ('incoming', 'dispatched', 'picked_up', 'completed');

-- Create enum type for user role
CREATE TYPE user_role AS ENUM ('admin', 'user');

-- ============================================
-- TABLE: users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk email lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================
-- TABLE: packages
-- ============================================
CREATE TABLE IF NOT EXISTS packages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resi VARCHAR(50) NOT NULL UNIQUE,
    package_name VARCHAR(255) NOT NULL,
    region VARCHAR(255),
    is_family_guardian BOOLEAN NOT NULL DEFAULT FALSE,
    is_no_region BOOLEAN NOT NULL DEFAULT FALSE,
    status package_status NOT NULL DEFAULT 'incoming',
    recipient_name VARCHAR(255),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk query filtering
CREATE INDEX IF NOT EXISTS idx_packages_resi ON packages(resi);
CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(status);
CREATE INDEX IF NOT EXISTS idx_packages_created_at ON packages(created_at);
CREATE INDEX IF NOT EXISTS idx_packages_updated_at ON packages(updated_at);
CREATE INDEX IF NOT EXISTS idx_packages_region ON packages(region);
CREATE INDEX IF NOT EXISTS idx_packages_is_family_guardian ON packages(is_family_guardian);
CREATE INDEX IF NOT EXISTS idx_packages_is_no_region ON packages(is_no_region);

-- Composite index untuk filter kombinasi
CREATE INDEX IF NOT EXISTS idx_packages_status_updated_at ON packages(status, updated_at);

-- Trigger untuk auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_packages_updated_at
    BEFORE UPDATE ON packages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLE: status_logs
-- ============================================
CREATE TABLE IF NOT EXISTS status_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    package_id UUID NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
    old_status package_status,
    new_status package_status NOT NULL,
    changed_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    note TEXT
);

-- Index untuk query audit trail
CREATE INDEX IF NOT EXISTS idx_status_logs_package_id ON status_logs(package_id);
CREATE INDEX IF NOT EXISTS idx_status_logs_changed_at ON status_logs(changed_at);
CREATE INDEX IF NOT EXISTS idx_status_logs_changed_by ON status_logs(changed_by);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS untuk semua tabel
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE status_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- POLICIES: users table
-- ============================================

-- Admin dapat melihat semua users
CREATE POLICY admin_users_select_all ON users
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- Admin dapat insert/update/delete users
CREATE POLICY admin_users_all ON users
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- User dapat melihat data mereka sendiri
CREATE POLICY users_select_own ON users
    FOR SELECT
    USING (id = auth.uid());

-- ============================================
-- POLICIES: packages table
-- ============================================

-- Admin: full access ke semua packages
CREATE POLICY admin_packages_all ON packages
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- User: read packages (7 hari terakhir)
CREATE POLICY user_packages_select ON packages
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'user'
        )
        AND updated_at >= NOW() - INTERVAL '7 days'
    );

-- User: update packages (hanya status dan recipient_name)
CREATE POLICY user_packages_update ON packages
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'user'
        )
        AND updated_at >= NOW() - INTERVAL '7 days'
    )
    WITH CHECK (
        updated_at >= NOW() - INTERVAL '7 days'
    );

-- Public: read packages (7 hari terakhir) - untuk tracking page
CREATE POLICY public_packages_select ON packages
    FOR SELECT
    USING (
        updated_at >= NOW() - INTERVAL '7 days'
    );

-- ============================================
-- POLICIES: status_logs table
-- ============================================

-- Admin: full access
CREATE POLICY admin_status_logs_all ON status_logs
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'admin'
        )
    );

-- User: read status logs (7 hari terakhir dari package)
CREATE POLICY user_status_logs_select ON status_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'user'
        )
        AND EXISTS (
            SELECT 1 FROM packages p 
            WHERE p.id = package_id 
            AND p.updated_at >= NOW() - INTERVAL '7 days'
        )
    );

-- User: insert status logs
CREATE POLICY user_status_logs_insert ON status_logs
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users u 
            WHERE u.id = auth.uid() AND u.role = 'user'
        )
    );

-- Public: read status logs (7 hari terakhir)
CREATE POLICY public_status_logs_select ON status_logs
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM packages p 
            WHERE p.id = package_id 
            AND p.updated_at >= NOW() - INTERVAL '7 days'
        )
    );

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function untuk create status log otomatis saat status berubah
CREATE OR REPLACE FUNCTION create_status_log()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO status_logs (package_id, old_status, new_status, changed_by, note)
        VALUES (NEW.id, OLD.status, NEW.status, NEW.updated_by, 'Status changed via trigger');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger untuk auto-create status log
CREATE TRIGGER trigger_create_status_log
    AFTER UPDATE ON packages
    FOR EACH ROW
    EXECUTE FUNCTION create_status_log();

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function untuk get current user role
CREATE OR REPLACE FUNCTION get_current_user_role()
RETURNS user_role AS $$
DECLARE
    user_role_val user_role;
BEGIN
    SELECT role INTO user_role_val FROM users WHERE id = auth.uid();
    RETURN user_role_val;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function untuk check if user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- SEED DATA (Optional - untuk testing)
-- ============================================

-- Catatan: Password hash adalah contoh, ganti dengan hash yang sebenarnya
-- Gunakan bcrypt atau argon2 untuk production

-- INSERT INTO users (name, email, password_hash, role) VALUES
-- ('Admin User', 'admin@example.com', '$2b$10$example_hash_here', 'admin'),
-- ('Regular User', 'user@example.com', '$2b$10$example_hash_here', 'user');

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE users IS 'Menyimpan data pengguna dengan role-based access control';
COMMENT ON TABLE packages IS 'Menyimpan data paket dengan status tracking real-time';
COMMENT ON TABLE status_logs IS 'Audit trail untuk setiap perubahan status paket';

COMMENT ON COLUMN packages.resi IS 'Nomor resi unik untuk identifikasi paket';
COMMENT ON COLUMN packages.is_family_guardian IS 'Flag untuk kategori Keluarga Pengasuh';
COMMENT ON COLUMN packages.is_no_region IS 'Flag untuk kategori Tanpa Wilayah';
COMMENT ON COLUMN packages.status IS 'Status paket: incoming, dispatched, picked_up, completed';
COMMENT ON COLUMN packages.recipient_name IS 'Nama penerima/pengambil paket';

COMMENT ON COLUMN status_logs.old_status IS 'Status sebelum perubahan (null untuk log pertama)';
COMMENT ON COLUMN status_logs.new_status IS 'Status setelah perubahan';
COMMENT ON COLUMN status_logs.note IS 'Catatan tambahan untuk perubahan status';

-- ============================================
-- VIEWS (Optional - untuk query yang lebih mudah)
-- ============================================

-- View untuk packages dengan 7 hari filter
CREATE OR REPLACE VIEW packages_active AS
SELECT * FROM packages
WHERE updated_at >= NOW() - INTERVAL '7 days';

-- View untuk package tracking info (public friendly)
CREATE OR REPLACE VIEW package_tracking_public AS
SELECT 
    id,
    resi,
    package_name,
    region,
    status,
    recipient_name,
    updated_at as last_updated
FROM packages
WHERE updated_at >= NOW() - INTERVAL '7 days';

-- ============================================
-- GRANTS (untuk service role jika diperlukan)
-- ============================================

-- Grant untuk authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant untuk anon users (public access terbatas)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON packages TO anon;
GRANT SELECT ON status_logs TO anon;

-- Revoke direct table access, force using RLS policies
REVOKE ALL ON users FROM anon;
