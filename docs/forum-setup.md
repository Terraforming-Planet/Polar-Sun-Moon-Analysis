# Forum Terraforming Planet — konfiguracja

Forum jest statycznym interfejsem wdrażanym przez GitHub Pages. Wspólne konta, posty i komentarze są zapisywane w Supabase.

## 1. Utwórz projekt Supabase

Utwórz projekt na stronie Supabase, a następnie otwórz **SQL Editor** i uruchom cały plik:

```text
supabase/forum-schema.sql
```

Skrypt tworzy tabele `forum_posts` i `forum_comments`, indeksy oraz zasady Row Level Security. Publiczni użytkownicy mogą czytać forum. Tylko zalogowani użytkownicy mogą dodawać treści, a edycja i usuwanie są ograniczone do autora.

## 2. Włącz logowanie e-mail

W Supabase otwórz **Authentication → Providers → Email**. Włącz logowanie e-mail i hasłem. Możesz zdecydować, czy rejestracja wymaga potwierdzenia adresu e-mail.

W **Authentication → URL Configuration** dodaj adres GitHub Pages do dozwolonych adresów przekierowania, np.:

```text
https://terraforming-planet.github.io/Polar-Sun-Moon-Analysis/forum/
```

## 3. Wstaw dane publicznego klienta

W Supabase otwórz **Project Settings → API** i skopiuj:

- Project URL,
- anon / publishable key.

Wpisz je do pliku:

```text
web/public/forum/config.js
```

Przykład:

```js
window.TERRAFORMING_FORUM_CONFIG = {
  supabaseUrl: 'https://twoj-projekt.supabase.co',
  supabaseAnonKey: 'twoj-publiczny-anon-key',
}
```

Klucz anon/publishable jest przeznaczony do użycia w przeglądarce. Nigdy nie umieszczaj w repozytorium klucza `service_role`.

## 4. Wdrożenie

Po scaleniu zmian GitHub Pages skopiuje katalog `web/public/forum/` do wyniku budowania. Forum będzie dostępne pod adresem:

```text
/forum/
```

Bez konfiguracji Supabase strona pokazuje post startowy w trybie podglądu, ale nie pozwala tworzyć wspólnych kont ani zapisywać publicznych komentarzy.
