-- Separate migration so the enum value is committed before functions use it.
alter type public.secondary_role add value if not exists 'fine_manager';
