const providersNode = document.querySelector('#providers')
const searchNode = document.querySelector('#search')
const statusNode = document.querySelector('#status')
const accessNode = document.querySelector('#access')
const countNode = document.querySelector('#providerCount')

const statusLabels = {
  'active-adapter': 'Aktywny adapter',
  'ready-for-adapter': 'Gotowe do adaptera',
  'planned-adapter': 'Planowany adapter',
  'registered-source': 'Zarejestrowane źródło',
  'discovery-backbone': 'Federacja katalogów',
  'licence-gated': 'Dostęp licencjonowany',
}

function accessGroup(value) {
  if (value.includes('public') || value.includes('federated')) return 'public'
  if (value.includes('account') || value.includes('token') || value.includes('registration')) return 'account'
  return 'commercial'
}

function render(items) {
  providersNode.replaceChildren()
  if (!items.length) {
    providersNode.innerHTML = '<p class="empty">Brak źródeł pasujących do filtrów.</p>'
    return
  }
  for (const source of items) {
    const article = document.createElement('article')
    article.className = `provider ${source.status}`
    const api = source.api ? `<a href="${source.api}" target="_blank" rel="noreferrer">API / endpoint</a>` : '<span class="no-api">Brak potwierdzonego publicznego API</span>'
    article.innerHTML = `
      <div class="provider-head"><span>${source.country}</span><b>${statusLabels[source.status] ?? source.status}</b></div>
      <h2>${source.agency}</h2>
      <p class="missions">${source.missions.join(' · ')}</p>
      <p>${source.notes}</p>
      <dl><dt>Dostęp</dt><dd>${source.access}</dd></dl>
      <div class="links"><a href="${source.portal}" target="_blank" rel="noreferrer">Oficjalny katalog</a>${api}</div>`
    providersNode.append(article)
  }
}

fetch('../data/tp26-global-sources.json')
  .then(response => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
  .then(data => {
    const providers = data.providers ?? []
    countNode.textContent = String(providers.length)
    const update = () => {
      const query = searchNode.value.trim().toLowerCase()
      const status = statusNode.value
      const access = accessNode.value
      render(providers.filter(source => {
        const haystack = [source.country, source.agency, ...source.missions, source.notes].join(' ').toLowerCase()
        return (!query || haystack.includes(query)) && (!status || source.status === status) && (!access || accessGroup(source.access) === access)
      }))
    }
    searchNode.addEventListener('input', update)
    statusNode.addEventListener('change', update)
    accessNode.addEventListener('change', update)
    update()
  })
  .catch(error => {
    providersNode.innerHTML = `<p class="empty">Nie udało się wczytać rejestru: ${String(error)}</p>`
  })
