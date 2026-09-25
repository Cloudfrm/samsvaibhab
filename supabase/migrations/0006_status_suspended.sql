-- An approved account can be pulled back later. That is not the same as being
-- rejected at sign-up, so it gets its own status.
-- Postgres will not let a new enum value be used in the same transaction that
-- creates it, so this step stands alone.

alter type public.review_status add value if not exists 'suspended' after 'rejected';
