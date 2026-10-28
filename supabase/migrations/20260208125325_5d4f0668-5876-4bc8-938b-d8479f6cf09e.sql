
-- Add referral_code to subscribers
ALTER TABLE public.subscribers 
ADD COLUMN referral_code text UNIQUE;

-- Generate referral codes for existing subscribers
UPDATE public.subscribers 
SET referral_code = lower(substr(md5(id::text || created_at::text), 1, 8))
WHERE referral_code IS NULL;

-- Make referral_code NOT NULL with a default going forward
ALTER TABLE public.subscribers 
ALTER COLUMN referral_code SET DEFAULT lower(substr(md5(random()::text), 1, 8));

-- Create referrals tracking table
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id uuid NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  referred_id uuid NOT NULL REFERENCES public.subscribers(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(referred_id)
);

-- Enable RLS on referrals
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Public can view referral counts (needed for dashboard lookup by referral_code)
CREATE POLICY "Public can view referrals by referrer"
ON public.referrals
FOR SELECT
USING (true);

-- Allow inserts from service role only (edge functions handle this)
-- No public INSERT/UPDATE/DELETE policies needed

-- Add index for fast referral lookups
CREATE INDEX idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX idx_subscribers_referral_code ON public.subscribers(referral_code);
