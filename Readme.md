-- Make sure RLS is enabled first
alter table public.otp enable row level security;

-- Allow anon key to read all rows (DEV ONLY)
create policy "Allow all read for anon"
on public.otp
for select
to anon
using (true);

use above command for the getting data 