-- =====================================================
-- Organizations Table Setup
-- =====================================================

-- Create the organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_organizations_name ON organizations(name);
CREATE INDEX IF NOT EXISTS idx_organizations_created_at ON organizations(created_at);

-- Add Row Level Security (RLS) if needed
-- ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Update User Profiles Table to include org_id
-- =====================================================

-- Add org_id column to user_profiles table
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Create index for better performance on org_id lookups
CREATE INDEX IF NOT EXISTS idx_user_profiles_org_id ON user_profiles(org_id);

-- Add helpful comment for the new column
COMMENT ON COLUMN user_profiles.org_id IS 'Links user to an organization';

-- =====================================================
-- Sample Data (Optional)
-- =====================================================

-- Uncomment to insert sample organizations
-- INSERT INTO organizations (name, description) VALUES 
-- ('Acme Corporation', 'A leading technology company'),
-- ('Tech Innovations', 'Cutting-edge software solutions'),
-- ('Digital Solutions', 'Digital transformation specialists')
-- ON CONFLICT (name) DO NOTHING; 