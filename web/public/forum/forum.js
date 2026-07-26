(() => {
  const config = window.TERRAFORMING_FORUM_CONFIG || {}
  const url = String(config.supabaseUrl || '').replace(/\/$/, '')
  const key = String(config.supabaseAnonKey || '')
  const configured = Boolean(url && key)
  const storageKey = 'terraforming-forum-session'
  const state = { session: null, posts: [], comments: [] }
  const $ = id => document.getElementById(id)
  const els = {
    session: $('session-card'), setup: $('setup-warning'), status: $('forum-status'), posts: $('posts'),
    composer: $('composer'), newPost: $('new-post-button'), refresh: $('refresh-button'), cancelPost: $('cancel-post'), publishPost: $('publish-post'),
    title: $('post-title'), category: $('post-category'), body: $('post-body'), authDialog: $('auth-dialog'), authName: $('auth-name'), authEmail: $('auth-email'), authPassword: $('auth-password'), authStatus: $('auth-status'), signIn: $('sign-in'), signUp: $('sign-up')
  }

  const seedPost = {
    id: 'tp-26-vision',
    title: 'TP-26, TP-676 i TP-17 576 — wielokierunkowy system obserwacji Ziemi',
    category: 'TP-26 i satelity',
    author_name: 'Sebastian Laskowski',
    created_at: '2026-07-26T03:40:00.000Z',
    body: `Chcę zaproponować rozwój globalnego, wielokierunkowego systemu obserwacji Ziemi dla projektu Terraforming Planet.\n\nPunktem wyjścia jest geometria sześcianu 3 × 3 × 3. Jedna pozycja centralna reprezentuje Ziemię, a pozostałe 26 pozycji odpowiada sześciu ścianom, dwunastu krawędziom i ośmiu narożnikom. TP-26 byłby wspólnym układem 26 zsynchronizowanych kierunków obserwacji, do których przypisywane są oryginalne produkty satelitarne z dokładnym czasem, identyfikatorem, footprintem, rozdzielczością i typem sensora.\n\nKolejny poziom to TP-676, czyli 26 obserwatorów lub źródeł dla każdego z 26 sektorów. Jeszcze bardziej zaawansowany wariant TP-17 576 odpowiada układowi 26 × 26 × 26. Nie muszą to być identyczne satelity. System powinien łączyć obserwacje optyczne, radar SAR, termowizję, pomiary atmosfery, wilgotności gleby, lodu, oceanów, rzek, pożarów i powodzi.\n\nNajważniejsza zasada: tryb naukowy nie może tworzyć fałszywego obrazu. Każdy piksel powinien zachowywać informację o źródle i czasie rejestracji. Jeżeli nie ma aktualnego pokrycia, system powinien pokazać brak danych albo wiek ostatniej obserwacji. Osobny tryb wizualny może wygładzać przejścia, ale musi być oznaczony jako rekonstrukcja wieloczasowa.\n\nNawet obraz aktualizowany co kilka minut mógłby znacząco wspierać badania optyki atmosferycznej, geometrii Słońca, cieni, klimatu, obiegu wody, pożarów i katastrof. Długoterminowym celem Terraforming Planet jest lepsze zrozumienie zależności między ukształtowaniem terenu, światłem, cieniem, wodą i temperaturą, aby przyszłe decyzje środowiskowe opierały się na mierzalnych danych.\n\nZapraszam naukowców, inżynierów, programistów i osoby zainteresowane obserwacją Ziemi do dyskusji: jak zaprojektować TP-26 tak, aby można go było skalować do setek lub tysięcy źródeł bez utraty wiarygodności danych?`,
  }

  function saveSession(session) {
    state.session = session
    if (session) localStorage.setItem(storageKey, JSON.stringify(session))
    else localStorage.removeItem(storageKey)
    renderSession()
  }

  function readSession() {
    try { return JSON.parse(localStorage.getItem(storageKey) || 'null') } catch { return null }
  }

  async function request(path, options = {}) {
    const headers = { apikey: key, 'Content-Type': 'application/json', ...(options.headers || {}) }
    if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`
    const response = await fetch(`${url}${path}`, { ...options, headers })
    const text = await response.text()
    const data = text ? JSON.parse(text) : null
    if (!response.ok) throw new Error(data?.msg || data?.message || data?.error_description || `HTTP ${response.status}`)
    return data
  }

  async function refreshSession() {
    if (!configured || !state.session?.refresh_token) return
    try {
      const data = await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: JSON.stringify({ refresh_token: state.session.refresh_token }) })
      saveSession(data)
    } catch { saveSession(null) }
  }

  function displayName() {
    return state.session?.user?.user_metadata?.display_name || state.session?.user?.email?.split('@')[0] || 'Użytkownik'
  }

  function renderSession() {
    if (!configured) {
      els.session.innerHTML = '<strong>Tryb podglądu</strong><span>Post startowy jest widoczny, ale wspólne konta i komentarze wymagają podłączenia bazy.</span><button id="open-login" type="button">Konfiguracja wymagana</button>'
      els.setup.hidden = false
      return
    }
    els.setup.hidden = true
    if (state.session?.user) {
      els.session.innerHTML = `<strong>Zalogowano jako ${escapeHtml(displayName())}</strong><span>${escapeHtml(state.session.user.email || '')}</span><button id="logout" type="button">Wyloguj</button>`
      $('logout').onclick = () => saveSession(null)
    } else {
      els.session.innerHTML = '<strong>Dołącz do dyskusji</strong><span>Zaloguj się, aby tworzyć posty i komentarze.</span><button id="open-login" class="primary" type="button">Zaloguj / utwórz konto</button>'
      $('open-login').onclick = () => els.authDialog.showModal()
    }
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]))
  }

  function formatDate(value) {
    return new Date(value).toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' })
  }

  function commentsFor(postId) {
    return state.comments.filter(comment => comment.post_id === postId)
  }

  function renderPosts() {
    const posts = state.posts.length ? state.posts : [seedPost]
    els.posts.innerHTML = posts.map(post => {
      const comments = commentsFor(post.id)
      const commentsHtml = comments.length ? comments.map(comment => `<article class="comment"><div class="comment-meta"><b>${escapeHtml(comment.author_name)}</b> · ${formatDate(comment.created_at)}</div><p>${escapeHtml(comment.body)}</p></article>`).join('') : '<p class="empty">Brak komentarzy. Rozpocznij dyskusję.</p>'
      return `<article class="post"><header class="post-head"><div class="post-meta"><span class="post-category">${escapeHtml(post.category)}</span><span>${escapeHtml(post.author_name)}</span><span>${formatDate(post.created_at)}</span></div><h2>${escapeHtml(post.title)}</h2></header><div class="post-body">${escapeHtml(post.body)}</div><section class="comments"><h3>Komentarze (${comments.length})</h3>${commentsHtml}<form class="comment-form" data-post-id="${escapeHtml(post.id)}"><textarea rows="3" maxlength="5000" placeholder="Dodaj komentarz…" ${state.session ? '' : 'disabled'}></textarea><button class="primary" type="submit" ${state.session ? '' : 'disabled'}>${state.session ? 'Dodaj komentarz' : 'Zaloguj się, aby komentować'}</button></form></section></article>`
    }).join('')
    document.querySelectorAll('.comment-form').forEach(form => form.addEventListener('submit', submitComment))
  }

  async function loadForum() {
    if (!configured) {
      state.posts = [seedPost]
      state.comments = []
      renderPosts()
      return
    }
    els.status.textContent = 'Ładowanie forum…'
    try {
      const [posts, comments] = await Promise.all([
        request('/rest/v1/forum_posts?select=*&order=created_at.desc'),
        request('/rest/v1/forum_comments?select=*&order=created_at.asc'),
      ])
      state.posts = posts?.length ? posts : [seedPost]
      state.comments = comments || []
      els.status.textContent = ''
      renderPosts()
    } catch (error) {
      els.status.textContent = `Nie udało się pobrać forum: ${error.message}`
      state.posts = [seedPost]
      state.comments = []
      renderPosts()
    }
  }

  async function submitComment(event) {
    event.preventDefault()
    if (!state.session) return els.authDialog.showModal()
    const form = event.currentTarget
    const textarea = form.querySelector('textarea')
    const body = textarea.value.trim()
    if (!body) return
    try {
      await request('/rest/v1/forum_comments', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ post_id: form.dataset.postId, author_id: state.session.user.id, author_name: displayName(), body }) })
      textarea.value = ''
      await loadForum()
    } catch (error) { els.status.textContent = `Nie udało się dodać komentarza: ${error.message}` }
  }

  async function publishPost() {
    if (!state.session) return els.authDialog.showModal()
    const title = els.title.value.trim()
    const body = els.body.value.trim()
    if (title.length < 5 || body.length < 20) { els.status.textContent = 'Tytuł lub treść są zbyt krótkie.'; return }
    try {
      await request('/rest/v1/forum_posts', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ author_id: state.session.user.id, author_name: displayName(), title, category: els.category.value, body }) })
      els.title.value = ''; els.body.value = ''; els.composer.hidden = true
      await loadForum()
    } catch (error) { els.status.textContent = `Nie udało się opublikować postu: ${error.message}` }
  }

  async function auth(mode) {
    if (!configured) return
    const email = els.authEmail.value.trim()
    const password = els.authPassword.value
    const name = els.authName.value.trim()
    els.authStatus.textContent = 'Trwa autoryzacja…'
    try {
      const path = mode === 'signup' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password'
      const body = mode === 'signup' ? { email, password, data: { display_name: name || email.split('@')[0] } } : { email, password }
      const data = await request(path, { method: 'POST', body: JSON.stringify(body) })
      if (data.access_token) {
        saveSession(data)
        els.authDialog.close()
        els.authStatus.textContent = ''
        renderPosts()
      } else {
        els.authStatus.textContent = 'Konto utworzone. Sprawdź skrzynkę e-mail i potwierdź rejestrację.'
      }
    } catch (error) { els.authStatus.textContent = error.message }
  }

  els.newPost.onclick = () => {
    if (!configured || !state.session) { if (configured) els.authDialog.showModal(); else els.setup.hidden = false; return }
    els.composer.hidden = false
    els.title.focus()
  }
  els.cancelPost.onclick = () => { els.composer.hidden = true }
  els.publishPost.onclick = publishPost
  els.refresh.onclick = loadForum
  els.signIn.onclick = () => auth('signin')
  els.signUp.onclick = () => auth('signup')

  state.session = readSession()
  renderSession()
  refreshSession().finally(loadForum)
})()
