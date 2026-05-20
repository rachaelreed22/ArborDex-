# ArborTag Staff Authentication & Park Management Setup

This guide walks you through setting up Supabase for staff authentication and park management.

## Prerequisites

1. Supabase project created (https://supabase.com)
2. Supabase URL and Anon Key ready
3. Environment variables set in `.env.local`:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_anon_key_here
   ```

## Step 1: Create Database Tables

Go to the Supabase SQL Editor and run the following SQL commands:

### 1.1 Create Parks Table

```sql
-- Create parks table
CREATE TABLE IF NOT EXISTS public.parks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  location TEXT,
  city TEXT,
  state TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes
CREATE INDEX idx_parks_name ON public.parks(name);
CREATE INDEX idx_parks_location ON public.parks(location);

-- Enable RLS
ALTER TABLE public.parks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Parks are viewable by everyone" ON public.parks
  FOR SELECT USING (true);
```

### 1.2 Create Staff Profiles Table

```sql
-- Create staff_profiles table
CREATE TABLE IF NOT EXISTS public.staff_profiles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'queen')),
  park_id UUID REFERENCES public.parks(id),
  name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id)
);

-- Add indexes
CREATE INDEX idx_staff_profiles_user_id ON public.staff_profiles(user_id);
CREATE INDEX idx_staff_profiles_park_id ON public.staff_profiles(park_id);
CREATE INDEX idx_staff_profiles_role ON public.staff_profiles(role);

-- Enable RLS
ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Staff can view their own profile
CREATE POLICY "Staff can view their own profile" ON public.staff_profiles
  FOR SELECT USING (auth.uid() = user_id);

-- Only authenticated users can view staff profiles
CREATE POLICY "Authenticated users can view staff profiles for parks" ON public.staff_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

-- Disable direct updates/deletes for now (use triggers or functions instead)
CREATE POLICY "Prevent direct staff profile updates" ON public.staff_profiles
  FOR UPDATE USING (false);

CREATE POLICY "Prevent direct staff profile deletes" ON public.staff_profiles
  FOR DELETE USING (false);
```

## Step 2: Insert Initial Data

### 2.1 Create the South Park, Pierce City, MO Park

```sql
-- Insert South Park
INSERT INTO public.parks (name, location, city, state)
VALUES (
  'South Park',
  'Pierce City',
  'Pierce City',
  'MO'
)
ON CONFLICT (id) DO NOTHING;

-- Get the park ID (you'll need this for step 2.2)
SELECT id FROM public.parks WHERE name = 'South Park' AND city = 'Pierce City';
```

**Important:** Copy the UUID returned from this query. You'll need it in step 2.2.

### 2.2 Create Queen Account (Manual Steps)

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user" or "Create user"
3. Use these credentials:
   - **Email:** queen@arbortag.local (or your preferred email)
   - **Password:** (Create a strong password and save it securely)
   - Check "Auto confirm user"

4. Once created, note the user's UUID

5. Insert the Queen staff profile in SQL Editor:

```sql
-- Replace USER_ID_HERE with the UUID from step 2.2
-- Replace PARK_UUID_HERE with the UUID from step 2.1
INSERT INTO public.staff_profiles (user_id, role, park_id, name, email)
VALUES (
  'USER_ID_HERE'::uuid,
  'queen',
  'PARK_UUID_HERE'::uuid,
  'Queen Admin',
  'queen@arbortag.local'
);
```

### 2.3 Create a Sample Staff Account (for testing)

1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user"
3. Use these credentials:
   - **Email:** sam@southpark.local
   - **Password:** (Create a strong password)
   - Check "Auto confirm user"
4. Note the user's UUID

5. Insert the staff profile:

```sql
-- Replace USER_ID_HERE with the UUID
-- Replace PARK_UUID_HERE with South Park's UUID from step 2.1
INSERT INTO public.staff_profiles (user_id, role, park_id, name, email)
VALUES (
  'USER_ID_HERE'::uuid,
  'staff',
  'PARK_UUID_HERE'::uuid,
  'Sam Parks Manager',
  'sam@southpark.local'
);
```

## Step 3: Environment Variables

Create `.env.local` in your client directory:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

Find these in Supabase Dashboard:
1. Go to Project Settings → API
2. Under "Project URL", copy the URL
3. Under "Project API keys", copy the "anon" key

## Step 4: Test the Login Flow

1. Start your dev server: `npm run dev`
2. Navigate to http://localhost:5173
3. Click "Admin Dashboard" button on homepage
4. You should see the login form
5. Test with the Queen account:
   - Email: `queen@arbortag.local`
   - Password: (the password you created)
6. After login, you should be redirected to park selector showing "South Park"

## Adding New Parks and Staff

### Add a New Park

```sql
INSERT INTO public.parks (name, location, city, state)
VALUES (
  'Park Name',
  'Location Description',
  'City',
  'MO'
);

-- Get the new park ID
SELECT id FROM public.parks WHERE name = 'Park Name';
```

Then in Supabase Auth, create a new staff user and insert their profile with the new park ID.

### Add Staff to Existing Park

1. Create new user in Supabase Auth → Users
2. Run SQL to add their profile (example):

```sql
INSERT INTO public.staff_profiles (user_id, role, park_id, name, email)
VALUES (
  'NEW_USER_ID'::uuid,
  'staff',
  'PARK_UUID'::uuid,
  'Staff Name',
  'staff@email.com'
);
```

## Troubleshooting

**Issue: "User not found" or login fails**
- Verify the user exists in Supabase Auth → Users
- Check email spelling and case sensitivity
- Ensure the user is "confirmed" (Auto confirm should handle this)

**Issue: Park selector shows no parks**
- Verify parks table has entries: `SELECT * FROM public.parks;`
- Check RLS policies are set correctly
- Verify staff profile has correct park_id reference

**Issue: Permission denied errors**
- Check Row Level Security (RLS) policies on both tables
- Verify user is authenticated (not anonymous)
- Check that staff_profiles.user_id matches the logged-in user

**Issue: Queen can't see all parks**
- Verify Queen account has role = 'queen'
- ParkSelector.jsx should show all parks for queen users

## Security Notes

- Queen account has full access to all parks - keep credentials secure
- Each staff account is restricted to their assigned park
- Passwords should be strong and unique
- Consider enabling 2FA in Supabase Dashboard for production

## Next Steps

After successful setup:

1. Test the full login and park selection flow
2. Verify staff can access their park's tree database at `/database`
3. Test Park Reports page protected access at `/park-report`
4. Add more parks as needed following the "Add a New Park" section above

---

For issues or questions, refer to the Supabase documentation: https://supabase.com/docs
