-- A new sign-up has not filled the form yet, so it is not waiting for review.
-- Postgres will not let a new enum value be used in the same transaction that
-- creates it, so this step stands alone.

alter type public.review_status add value if not exists 'incomplete' before 'pending';
