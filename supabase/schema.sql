-- ==============================================================================
-- SCHEMA SUPABASE : GESTION DE CAISSE & UTILISATEURS
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMÉRATIONS & TYPES
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'caissier', 'rh', 'employe', 'client', 'partenaire');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. TABLE DES PROFILS UTILISATEURS
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    role user_role DEFAULT 'caissier'::user_role NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les profils sont consultables par tous les utilisateurs authentifiés"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Les utilisateurs peuvent modifier leur propre profil"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id);

-- 4. TABLE DES TRANSACTIONS DE CAISSE
CREATE TABLE IF NOT EXISTS public.cashier_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    libelle TEXT NOT NULL,
    type_transaction TEXT NOT NULL,
    type_description TEXT,
    category TEXT NOT NULL CHECK (category IN ('entree', 'sortie')),
    first_name TEXT,
    employee TEXT,
    quantity NUMERIC DEFAULT 1,
    montant NUMERIC NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Activation de RLS sur cashier_transactions
ALTER TABLE public.cashier_transactions ENABLE ROW LEVEL SECURITY;

-- 5. POLITIQUES RLS
-- Lecture : les utilisateurs authentifiés
CREATE POLICY "cashier_transactions_select_policy"
    ON public.cashier_transactions
    FOR SELECT
    TO authenticated
    USING (true);

-- Insertion : les utilisateurs authentifiés (admin, caissier, etc.)
CREATE POLICY "cashier_transactions_insert_policy"
    ON public.cashier_transactions
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Modification : les utilisateurs authentifiés
CREATE POLICY "cashier_transactions_update_policy"
    ON public.cashier_transactions
    FOR UPDATE
    TO authenticated
    USING (true);

-- Suppression : les utilisateurs authentifiés
CREATE POLICY "cashier_transactions_delete_policy"
    ON public.cashier_transactions
    FOR DELETE
    TO authenticated
    USING (true);

-- 6. TRIGGER DE SYNCHRONISATION UTILISATEUR
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, first_name, last_name, role)
    VALUES (
        new.id,
        new.email,
        new.raw_user_meta_data->>'first_name',
        new.raw_user_meta_data->>'last_name',
        COALESCE((new.raw_user_meta_data->>'role')::user_role, 'caissier'::user_role)
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
