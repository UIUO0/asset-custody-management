-- ORG local seed: storage buckets required by the app.
-- Mirrors apps/docs/supabase-setup.md:
--   profile-pictures (public), assets (private), kits (private),
--   files (public), locations (private),
--   custody-signatures (private — ORG handover signature images),
--   goods-receipt-signatures (private — ORG intake form signature images).
-- Client-side writes stay denied (RLS with no permissive policies);
-- the app uploads through the service role, which bypasses RLS.

insert into storage.buckets (id, name, public)
values
  ('profile-pictures', 'profile-pictures', true),
  ('assets', 'assets', false),
  ('kits', 'kits', false),
  ('files', 'files', true),
  ('locations', 'locations', false),
  -- Signature images are personal data: private bucket, served only through
  -- short-lived signed URLs.
  ('custody-signatures', 'custody-signatures', false),
  -- Same reasoning for the three signatures on each مذكرة/محضر استلام.
  ('goods-receipt-signatures', 'goods-receipt-signatures', false)
on conflict (id) do nothing;
