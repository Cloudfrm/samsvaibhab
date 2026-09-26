-- samsvaibhab: buyer onboarding fields.
--
-- A buyer needs no approval and no ID document. They just fill in these
-- fields and their account is active straight away.

alter table public.profiles
  add column delivery_location text,
  add column state text,
  add column pin_code text,
  add column special_requirement text;
