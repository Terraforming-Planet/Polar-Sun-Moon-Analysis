create extension if not exists pgcrypto;

create table if not exists public.forum_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 60),
  title text not null check (char_length(title) between 5 and 180),
  category text not null default 'Pomysły społeczności' check (char_length(category) between 2 and 80),
  body text not null check (char_length(body) between 20 and 20000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.forum_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.forum_posts(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null check (char_length(author_name) between 1 and 60),
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index if not exists forum_posts_created_at_idx on public.forum_posts(created_at desc);
create index if not exists forum_comments_post_id_idx on public.forum_comments(post_id, created_at);
create index if not exists forum_posts_author_id_idx on public.forum_posts(author_id);
create index if not exists forum_comments_author_id_idx on public.forum_comments(author_id);

alter table public.forum_posts enable row level security;
alter table public.forum_comments enable row level security;

grant select on public.forum_posts, public.forum_comments to anon, authenticated;
grant insert on public.forum_posts, public.forum_comments to authenticated;
grant update, delete on public.forum_posts, public.forum_comments to authenticated;

create policy "Forum posts are publicly readable"
on public.forum_posts for select
to anon, authenticated
using (true);

create policy "Authenticated users create their own posts"
on public.forum_posts for insert
to authenticated
with check ((select auth.uid()) = author_id);

create policy "Authors update their own posts"
on public.forum_posts for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

create policy "Authors delete their own posts"
on public.forum_posts for delete
to authenticated
using ((select auth.uid()) = author_id);

create policy "Forum comments are publicly readable"
on public.forum_comments for select
to anon, authenticated
using (true);

create policy "Authenticated users create their own comments"
on public.forum_comments for insert
to authenticated
with check ((select auth.uid()) = author_id);

create policy "Authors update their own comments"
on public.forum_comments for update
to authenticated
using ((select auth.uid()) = author_id)
with check ((select auth.uid()) = author_id);

create policy "Authors delete their own comments"
on public.forum_comments for delete
to authenticated
using ((select auth.uid()) = author_id);

insert into public.forum_posts (author_id, author_name, title, category, body)
select null, 'Sebastian Laskowski',
'TP-26, TP-676 i TP-17 576 — wielokierunkowy system obserwacji Ziemi',
'TP-26 i satelity',
$forum$
Chcę zaproponować rozwój globalnego, wielokierunkowego systemu obserwacji Ziemi dla projektu Terraforming Planet.

Punktem wyjścia jest geometria sześcianu 3 × 3 × 3. Jedna pozycja centralna reprezentuje Ziemię, a pozostałe 26 pozycji odpowiada sześciu ścianom, dwunastu krawędziom i ośmiu narożnikom. TP-26 byłby wspólnym układem 26 zsynchronizowanych kierunków obserwacji, do których przypisywane są oryginalne produkty satelitarne z dokładnym czasem, identyfikatorem, footprintem, rozdzielczością i typem sensora.

Kolejny poziom to TP-676, czyli 26 obserwatorów lub źródeł dla każdego z 26 sektorów. Jeszcze bardziej zaawansowany wariant TP-17 576 odpowiada układowi 26 × 26 × 26. Nie muszą to być identyczne satelity. System powinien łączyć obserwacje optyczne, radar SAR, termowizję, pomiary atmosfery, wilgotności gleby, lodu, oceanów, rzek, pożarów i powodzi.

Najważniejsza zasada: tryb naukowy nie może tworzyć fałszywego obrazu. Każdy piksel powinien zachowywać informację o źródle i czasie rejestracji. Jeżeli nie ma aktualnego pokrycia, system powinien pokazać brak danych albo wiek ostatniej obserwacji. Osobny tryb wizualny może wygładzać przejścia, ale musi być oznaczony jako rekonstrukcja wieloczasowa.

Nawet obraz aktualizowany co kilka minut mógłby znacząco wspierać badania optyki atmosferycznej, geometrii Słońca, cieni, klimatu, obiegu wody, pożarów i katastrof. Długoterminowym celem Terraforming Planet jest lepsze zrozumienie zależności między ukształtowaniem terenu, światłem, cieniem, wodą i temperaturą, aby przyszłe decyzje środowiskowe opierały się na mierzalnych danych.

Zapraszam naukowców, inżynierów, programistów i osoby zainteresowane obserwacją Ziemi do dyskusji: jak zaprojektować TP-26 tak, aby można go było skalować do setek lub tysięcy źródeł bez utraty wiarygodności danych?
$forum$
where not exists (
  select 1 from public.forum_posts
  where title = 'TP-26, TP-676 i TP-17 576 — wielokierunkowy system obserwacji Ziemi'
);
