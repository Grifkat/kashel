-- Схема хранилища в облаке. Выполняется один раз в SQL Editor Supabase.
--
-- Что здесь есть и чего здесь нет.
--
-- Есть две таблицы. В одной лежат файлы: ярлык вместо имени, ком байтов
-- вместо содержимого. Сервер не знает ни как называется файл, ни что в нём —
-- ключи выводятся из пароля на устройстве человека и сюда не попадают. Во
-- второй лежат приглашения: пока код не выдан, зарегистрироваться нельзя.
--
-- Нет ничего, что позволяло бы одному человеку увидеть чужое. Это держится
-- не на порядочности кода в браузере — тот у любого свой и переписывается за
-- минуту, — а на правилах доступа самой базы. Ключ anon публичен, и всякий,
-- кто откроет исходный текст страницы, сможет обратиться к базе напрямую.
-- Значит проверять права обязана база, а не окно.
--
-- Порядок такой: сначала таблицы, потом запрет на всё, потом точечные
-- разрешения. Забыть включить row level security на таблице — обычная и самая
-- дорогая ошибка в Supabase: без него ключ anon читает всё подряд.

-- ---------------------------------------------------------------- файлы

create table if not exists public.files (
  -- Чей файл. Ссылка на встроенную таблицу учётных записей Supabase.
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Ярлык пути: HMAC от имени файла на ключе, который есть только у хозяина.
  -- Шестьдесят четыре шестнадцатеричных знака, см. lib/crypto.
  path_id text not null check (path_id ~ '^[0-9a-f]{64}$'),

  -- Ком: вектор и шифротекст в основаниях 64. Сервер прочесть его не может.
  blob text not null,

  -- Счётчик правок. По нему разбираются расхождения между устройствами:
  -- запись не проходит, если на сервере уже лежит версия новее той, от
  -- которой отталкивался пишущий.
  version bigint not null default 1 check (version > 0),

  updated_at timestamptz not null default now(),

  primary key (user_id, path_id)
);

-- Выборка всегда идёт по хозяину: без указателя она превратилась бы в перебор
-- всей таблицы, когда людей станет больше десятка.
create index if not exists files_user_idx on public.files (user_id);

alter table public.files enable row level security;

-- Четыре правила, и все об одном: человек видит и меняет только своё.
-- auth.uid() берётся из подписанного токена, подделать его из браузера нельзя.
drop policy if exists "свои файлы видны" on public.files;
create policy "свои файлы видны" on public.files
  for select using (auth.uid() = user_id);

drop policy if exists "свои файлы пишутся" on public.files;
create policy "свои файлы пишутся" on public.files
  for insert with check (auth.uid() = user_id);

drop policy if exists "свои файлы правятся" on public.files;
create policy "свои файлы правятся" on public.files
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "свои файлы удаляются" on public.files;
create policy "свои файлы удаляются" on public.files
  for delete using (auth.uid() = user_id);

-- ------------------------------------------------------------ приглашения

create table if not exists public.invites (
  code text primary key check (length(code) between 6 and 64),
  -- Кем занято. Пока пусто — приглашение свободно.
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

alter table public.invites enable row level security;

-- Ни одного правила: читать и писать эту таблицу напрямую нельзя никому с
-- ключом anon. Иначе список свободных кодов был бы виден любому желающему.
-- Всё общение с ней идёт через функцию ниже.

/*
 * Занять приглашение.
 *
 * Вызывается сразу после того, как учётная запись заведена: до этого шага
 * человек в базе есть, но ни одного файла записать не может — правило ниже
 * этого не позволит.
 *
 * security definer: функция работает правами хозяина схемы и потому видит
 * таблицу, закрытую для всех остальных. search_path прибит гвоздями — без
 * этого вызывающий мог бы подсунуть свою схему и подменить смысл функции.
 *
 * Условие занятия строгое: код должен существовать и быть свободным. Гонку
 * двух одновременных попыток разрешает сама база — update ... where used_by
 * is null отдаст строку ровно одному.
 */
create or replace function public.claim_invite(invite_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  занято integer;
begin
  if auth.uid() is null then
    raise exception 'нужно войти';
  end if;

  -- Уже занимал раньше — считаем, что всё в порядке: повторный вход не должен
  -- требовать нового кода.
  if exists (select 1 from public.invites where used_by = auth.uid()) then
    return true;
  end if;

  update public.invites
     set used_by = auth.uid(), used_at = now()
   where code = invite_code
     and used_by is null;

  get diagnostics занято = row_count;
  return занято = 1;
end;
$$;

revoke all on function public.claim_invite(text) from public;
grant execute on function public.claim_invite(text) to authenticated;

/*
 * Приглашение занято этим человеком.
 *
 * На это опирается правило записи файлов: завести учётную запись мало, нужно
 * ещё войти по приглашению. Иначе открытая регистрация в Supabase дала бы
 * любому желающему место в вашей базе.
 */
create or replace function public.invited()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.invites where used_by = auth.uid());
$$;

revoke all on function public.invited() from public;
grant execute on function public.invited() to authenticated;

-- Запись файлов — только приглашённым. Читать и удалять своё можно всегда:
-- отними это, и человек, оставшийся без приглашения, потерял бы доступ к
-- собственным данным, а забирать чужое мы не нанимались.
drop policy if exists "свои файлы пишутся" on public.files;
create policy "свои файлы пишутся" on public.files
  for insert with check (auth.uid() = user_id and public.invited());

drop policy if exists "свои файлы правятся" on public.files;
create policy "свои файлы правятся" on public.files
  for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.invited());
