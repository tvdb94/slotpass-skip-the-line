
create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  cuisine text not null,
  description text,
  logo_url text, hero_url text,
  address text, lat double precision, lng double precision,
  rating numeric(2,1) default 4.5,
  brand_primary text default '#111827',
  brand_secondary text default '#f3f4f6',
  currency text default 'EUR',
  service_fee_cents int default 75,
  is_featured boolean default false,
  is_active boolean default true,
  timezone text default 'Europe/Amsterdam',
  featured_headline_nl text, featured_headline_en text,
  created_at timestamptz default now()
);
create table public.staff (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  auth_user_id uuid not null,
  email text,
  created_at timestamptz default now(),
  unique(vendor_id, auth_user_id)
);
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name_nl text not null, name_en text not null,
  sort_order int default 0
);
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name_nl text not null, name_en text not null,
  description_nl text, description_en text,
  price_cents int not null,
  image_url text,
  is_available boolean default true,
  sort_order int default 0
);
create table public.slots (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  date date not null, start_time time not null, end_time time not null,
  capacity int not null default 20,
  orders_count int not null default 0,
  discount_pct int not null default 0,
  is_open boolean not null default true,
  unique(vendor_id, date, start_time)
);
create table public.item_slot_discounts (
  id uuid primary key default gen_random_uuid(),
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  slot_id uuid not null references public.slots(id) on delete cascade,
  discount_pct int, discount_cents int,
  unique(menu_item_id, slot_id)
);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  slot_id uuid not null references public.slots(id) on delete restrict,
  order_code text unique not null,
  status text not null default 'pending_payment',
  subtotal_cents int not null default 0,
  discount_cents int not null default 0,
  service_fee_cents int not null default 75,
  total_cents int not null default 0,
  customer_name text, customer_email text, customer_phone text,
  stripe_payment_intent_id text, qr_token text unique,
  created_at timestamptz default now(),
  paid_at timestamptz, collected_at timestamptz
);
create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  name text not null,
  unit_price_cents int not null,
  discount_cents int default 0,
  quantity int not null default 1
);

-- GRANTS
grant select on public.vendors, public.categories, public.menu_items, public.slots, public.item_slot_discounts to anon, authenticated;
grant insert, update, delete on public.vendors, public.categories, public.menu_items, public.slots, public.item_slot_discounts to authenticated;
grant select, insert, update, delete on public.staff to authenticated;
grant select, insert, update on public.orders, public.order_items to anon, authenticated;
grant all on public.vendors, public.staff, public.categories, public.menu_items, public.slots, public.item_slot_discounts, public.orders, public.order_items to service_role;

-- Helper
create or replace function public.is_vendor_staff(_vendor_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.staff where vendor_id = _vendor_id and auth_user_id = auth.uid());
$$;

-- RLS
alter table public.vendors enable row level security;
alter table public.staff enable row level security;
alter table public.categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.slots enable row level security;
alter table public.item_slot_discounts enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "vendors read" on public.vendors for select using (is_active);
create policy "vendors staff update" on public.vendors for update to authenticated
  using (public.is_vendor_staff(id)) with check (public.is_vendor_staff(id));

create policy "staff self read" on public.staff for select to authenticated using (auth_user_id = auth.uid());
create policy "staff self insert" on public.staff for insert to authenticated with check (auth_user_id = auth.uid());

create policy "cats read" on public.categories for select using (true);
create policy "cats staff" on public.categories for all to authenticated
  using (public.is_vendor_staff(vendor_id)) with check (public.is_vendor_staff(vendor_id));

create policy "menu read" on public.menu_items for select using (true);
create policy "menu staff" on public.menu_items for all to authenticated
  using (public.is_vendor_staff(vendor_id)) with check (public.is_vendor_staff(vendor_id));

create policy "slots read" on public.slots for select using (true);
create policy "slots staff" on public.slots for all to authenticated
  using (public.is_vendor_staff(vendor_id)) with check (public.is_vendor_staff(vendor_id));

create policy "isd read" on public.item_slot_discounts for select using (true);
create policy "isd staff" on public.item_slot_discounts for all to authenticated
  using (exists (select 1 from public.menu_items mi where mi.id = menu_item_id and public.is_vendor_staff(mi.vendor_id)))
  with check (exists (select 1 from public.menu_items mi where mi.id = menu_item_id and public.is_vendor_staff(mi.vendor_id)));

create policy "orders insert" on public.orders for insert with check (true);
create policy "orders read" on public.orders for select using (true);
create policy "orders staff update" on public.orders for update to authenticated
  using (public.is_vendor_staff(vendor_id)) with check (public.is_vendor_staff(vendor_id));

create policy "oi read" on public.order_items for select using (true);
create policy "oi insert" on public.order_items for insert with check (true);

-- SEED VENDORS
insert into public.vendors (slug, name, cuisine, description, logo_url, hero_url, address, lat, lng, rating, brand_primary, brand_secondary, is_featured, featured_headline_nl, featured_headline_en) values
('fabel-friet', 'Fabel Friet', 'Frieten', 'Ambachtelijke frieten met huisgemaakte sauzen in het hart van Amsterdam.',
 'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=200',
 'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=1200',
 'Runstraat 1, 1016 GJ Amsterdam', 52.3680, 4.8850, 4.8, '#EA580C', '#FFF7ED', true,
 '-20% off-peak bij Fabel Friet, 14:00–15:30', '-20% off-peak at Fabel Friet, 14:00–15:30'),
('van-stapele', 'Van Stapele Koekmakerij', 'Bakkerij', 'De legendarische gevulde chocolade cookie. Warm uit de oven.',
 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=200',
 'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=1200',
 'Heisteeg 4, 1016 CN Amsterdam', 52.3702, 4.8896, 4.9, '#3B1F16', '#F5EBE0', false, null, null),
('chun', 'Chun', 'Koreaans', 'Gestapelde Koreaanse sandwiches, bold en pittig.',
 'https://images.unsplash.com/photo-1554502078-ef0fc409efce?w=200',
 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1200',
 'Bilderdijkstraat 92, 1053 KV Amsterdam', 52.3665, 4.8724, 4.7, '#DC2626', '#111111', true,
 '-15% bij Chun in rustige slots', '-15% at Chun during quiet slots');

-- Categories + menus
with v as (select id from public.vendors where slug='fabel-friet')
insert into public.categories (vendor_id, name_nl, name_en, sort_order)
select v.id, x.nl, x.en, x.o from v, (values ('Frieten','Fries',1),('Sauzen','Sauces',2),('Drinken','Drinks',3)) as x(nl,en,o);

with v as (select id from public.vendors where slug='van-stapele')
insert into public.categories (vendor_id, name_nl, name_en, sort_order)
select v.id, x.nl, x.en, x.o from v, (values ('Koekjes','Cookies',1),('Koffie','Coffee',2)) as x(nl,en,o);

with v as (select id from public.vendors where slug='chun')
insert into public.categories (vendor_id, name_nl, name_en, sort_order)
select v.id, x.nl, x.en, x.o from v, (values ('Sandwiches','Sandwiches',1),('Sides','Sides',2),('Drinken','Drinks',3)) as x(nl,en,o);

insert into public.menu_items (vendor_id, category_id, name_nl, name_en, description_nl, description_en, price_cents, image_url, sort_order)
select v.id, c.id, m.nl, m.en, m.dnl, m.den, m.p, m.img, m.o
from public.vendors v
join public.categories c on c.vendor_id = v.id
join (values
  ('fabel-friet','Frieten','Klassieke friet','Classic fries','Dubbel gebakken, met mayo','Double-fried, with mayo',450,'https://images.unsplash.com/photo-1630384060421-cb20d0e0649d?w=400',1),
  ('fabel-friet','Frieten','Truffelfriet','Truffle fries','Met truffelmayo en Parmezaan','With truffle mayo and Parmesan',750,'https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=400',2),
  ('fabel-friet','Sauzen','Joppiesaus','Joppie sauce',null,null,100,null,1),
  ('fabel-friet','Sauzen','Curry ketchup','Curry ketchup',null,null,100,null,2),
  ('fabel-friet','Drinken','Cola','Cola',null,null,300,null,1),
  ('van-stapele','Koekjes','De cookie','The cookie','Onze wereldberoemde gevulde chocolade cookie','Our world-famous filled chocolate cookie',280,'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400',1),
  ('van-stapele','Koekjes','Doosje van 6','Box of 6','Zes cookies om te delen','Six cookies to share',1500,null,2),
  ('van-stapele','Koffie','Espresso','Espresso',null,null,280,null,1),
  ('van-stapele','Koffie','Cappuccino','Cappuccino',null,null,380,null,2),
  ('chun','Sandwiches','Bulgogi sando','Bulgogi sando','Gemarineerd rundvlees, kimchi mayo','Marinated beef, kimchi mayo',1250,'https://images.unsplash.com/photo-1553909489-cd47e0ef937f?w=400',1),
  ('chun','Sandwiches','Fried chicken sando','Fried chicken sando','Krokante kip, gochujang','Crispy chicken, gochujang',1150,'https://images.unsplash.com/photo-1606755962773-d324e0a13086?w=400',2),
  ('chun','Sides','Kimchi fries','Kimchi fries',null,null,650,null,1),
  ('chun','Drinken','Yuzu limonade','Yuzu lemonade',null,null,400,null,1)
) as m(slug,cat,nl,en,dnl,den,p,img,o) on m.slug = v.slug and (m.cat = c.name_nl or m.cat = c.name_en);

-- Slots: today + 2 days, 12:00-20:00, 15 min, capacity 20, with off-peak discounts
insert into public.slots (vendor_id, date, start_time, end_time, capacity, discount_pct)
select v.id,
       (current_date + d)::date,
       (time '12:00' + (n * interval '15 min'))::time,
       (time '12:00' + ((n+1) * interval '15 min'))::time,
       20,
       case
         when v.slug='fabel-friet' and (time '12:00' + (n*interval '15 min'))::time >= time '14:00' and (time '12:00' + (n*interval '15 min'))::time < time '15:30' then 20
         when v.slug='chun' and (time '12:00' + (n*interval '15 min'))::time >= time '15:00' and (time '12:00' + (n*interval '15 min'))::time < time '16:00' then 15
         when v.slug='van-stapele' and (time '12:00' + (n*interval '15 min'))::time >= time '16:00' and (time '12:00' + (n*interval '15 min'))::time < time '17:00' then 10
         else 0
       end
from public.vendors v
cross join generate_series(0,2) d
cross join generate_series(0,31) n;
