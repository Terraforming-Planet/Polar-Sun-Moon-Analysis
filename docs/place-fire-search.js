(() => {
  const state = { viewer: null, place: null, fireEntityIds: [] }
  window.__terraPlaceFireSearch = state

  function captureCesiumViewer() {
    if (!window.Cesium || window.Cesium.Viewer.__terraWrapped) return
    const OriginalViewer = window.Cesium.Viewer
    function WrappedViewer(...args) {
      const viewer = new OriginalViewer(...args)
      state.viewer = viewer
      window.dispatchEvent(new CustomEvent('terra:viewer-ready'))
      return viewer
    }
    WrappedViewer.prototype = OriginalViewer.prototype
    Object.setPrototypeOf(WrappedViewer, OriginalViewer)
    WrappedViewer.__terraWrapped = true
    window.Cesium.Viewer = WrappedViewer
  }

  const originalAppend = document.head.appendChild.bind(document.head)
  document.head.appendChild = node => {
    if (node instanceof HTMLScriptElement && /Cesium\.js/.test(node.src)) {
      node.addEventListener('load', captureCesiumViewer, { once: true })
    }
    return originalAppend(node)
  }
  const cesiumTimer = window.setInterval(() => {
    if (window.Cesium) {
      captureCesiumViewer()
      window.clearInterval(cesiumTimer)
    }
  }, 50)

  const waitFor = (selector, timeout = 15000) => new Promise((resolve, reject) => {
    const found = document.querySelector(selector)
    if (found) return resolve(found)
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector)
      if (element) { observer.disconnect(); resolve(element) }
    })
    observer.observe(document.documentElement, { childList: true, subtree: true })
    window.setTimeout(() => { observer.disconnect(); reject(new Error('Nie znaleziono miejsca dla wyszukiwarki.')) }, timeout)
  })

  async function geocode(query) {
    const endpoints = [
      `https://photon.komoot.io/api/?limit=1&q=${encodeURIComponent(query)}`,
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`,
    ]
    for (const url of endpoints) {
      try {
        const response = await fetch(url, { headers: { Accept: 'application/json' } })
        if (!response.ok) continue
        const data = await response.json()
        if (data.features?.[0]) {
          const feature = data.features[0]
          const [longitude, latitude] = feature.geometry.coordinates
          const p = feature.properties || {}
          return { longitude, latitude, name: [p.name, p.city, p.state, p.country].filter(Boolean).join(', ') || query }
        }
        if (data[0]) return { longitude: Number(data[0].lon), latitude: Number(data[0].lat), name: data[0].display_name || query }
      } catch (_) {}
    }
    throw new Error('Nie znaleziono miejscowości. Dodaj kraj, np. „Valencia, Hiszpania”.')
  }

  function distanceKm(aLat, aLon, bLat, bLon) {
    const r = 6371
    const dLat = (bLat - aLat) * Math.PI / 180
    const dLon = (bLon - aLon) * Math.PI / 180
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
    return 2 * r * Math.asin(Math.sqrt(x))
  }

  async function loadWildfires(place, radiusKm) {
    const response = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&days=30&limit=300')
    if (!response.ok) throw new Error(`NASA EONET HTTP ${response.status}`)
    const data = await response.json()
    return (data.events || []).map(event => {
      const geometries = event.geometry || []
      const latest = geometries.at(-1)
      if (!latest || latest.type !== 'Point') return null
      const [longitude, latitude] = latest.coordinates
      return { event, longitude, latitude, distance: distanceKm(place.latitude, place.longitude, latitude, longitude) }
    }).filter(Boolean).filter(item => item.distance <= radiusKm).sort((a, b) => a.distance - b.distance)
  }

  function clearFireEntities() {
    if (!state.viewer) return
    for (const id of state.fireEntityIds) state.viewer.entities.removeById(id)
    state.fireEntityIds = []
  }

  function addFireEntities(events) {
    const viewer = state.viewer
    const Cesium = window.Cesium
    if (!viewer || !Cesium) return false
    clearFireEntities()
    events.forEach((item, index) => {
      const id = `terra-live-fire-${item.event.id || index}`
      viewer.entities.add({
        id,
        position: Cesium.Cartesian3.fromDegrees(item.longitude, item.latitude, 100),
        point: { pixelSize: 14, color: Cesium.Color.fromCssColorString('#ff3b20'), outlineColor: Cesium.Color.fromCssColorString('#ffd45c'), outlineWidth: 3 },
        label: { text: `🔥 ${item.event.title}`, font: '14px sans-serif', pixelOffset: new Cesium.Cartesian2(0, -24), fillColor: Cesium.Color.WHITE, showBackground: true, backgroundColor: Cesium.Color.fromCssColorString('#280900cc'), distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2500000) },
      })
      state.fireEntityIds.push(id)
      const points = (item.event.geometry || []).filter(g => g.type === 'Point').map(g => Cesium.Cartesian3.fromDegrees(g.coordinates[0], g.coordinates[1], 120))
      if (points.length > 1) {
        const pathId = `${id}-path`
        viewer.entities.add({ id: pathId, polyline: { positions: points, width: 4, material: Cesium.Color.fromCssColorString('#ff7a00cc'), clampToGround: true } })
        state.fireEntityIds.push(pathId)
      }
    })
    viewer.scene.requestRender()
    return true
  }

  function findButton(text) {
    return [...document.querySelectorAll('button')].find(button => button.textContent?.trim().includes(text))
  }

  async function waitForViewer(timeout = 30000) {
    if (state.viewer && !state.viewer.isDestroyed?.()) return state.viewer
    return new Promise((resolve, reject) => {
      const started = Date.now()
      const onReady = () => {
        if (state.viewer && !state.viewer.isDestroyed?.()) finish(state.viewer)
      }
      const timer = window.setInterval(() => {
        if (state.viewer && !state.viewer.isDestroyed?.()) finish(state.viewer)
        else if (Date.now() - started >= timeout) finish(null)
      }, 100)
      function finish(viewer) {
        window.clearInterval(timer)
        window.removeEventListener('terra:viewer-ready', onReady)
        viewer ? resolve(viewer) : reject(new Error('Model Ziemi 3D nie uruchomił się. Odśwież stronę i spróbuj ponownie.'))
      }
      window.addEventListener('terra:viewer-ready', onReady)
    })
  }

  async function ensureFreshViewer() {
    captureCesiumViewer()
    if (state.viewer && !state.viewer.isDestroyed?.()) return state.viewer

    const earthTab = findButton('Ziemia 3D')
    if (earthTab) earthTab.click()

    await new Promise(resolve => setTimeout(resolve, 400))
    if (state.viewer && !state.viewer.isDestroyed?.()) return state.viewer

    // Jeśli glob został utworzony przed założeniem przechwycenia, wymuszamy jego bezpieczne
    // ponowne zamontowanie przez zmianę zakładki i powrót do Ziemi 3D.
    const controlTab = findButton('Centrum sterowania')
    if (controlTab && earthTab) {
      controlTab.click()
      await new Promise(resolve => setTimeout(resolve, 250))
      earthTab.click()
    }
    return waitForViewer()
  }

  async function focusPlace(place) {
    const viewer = await ensureFreshViewer()
    if (!window.Cesium) throw new Error('Biblioteka Cesium nie jest dostępna.')
    viewer.camera.flyTo({ destination: window.Cesium.Cartesian3.fromDegrees(place.longitude, place.latitude, 550000), duration: 2 })
    viewer.scene.requestRender()
  }

  function renderResults(container, place, events, radiusKm, mapReady) {
    const list = events.slice(0, 8).map(item => {
      const last = item.event.geometry?.at(-1)
      const date = last?.date ? new Date(last.date).toLocaleString('pl-PL', { timeZone: 'UTC' }) + ' UTC' : 'czas niepodany'
      return `<li><strong>${item.event.title}</strong><span>${item.distance.toFixed(0)} km od wybranego miejsca · ${date}</span></li>`
    }).join('')
    const mapNote = mapReady ? ' Miejsce i punkty zostały naniesione na glob 3D.' : ' Lista została pobrana, ale glob nie był jeszcze gotowy do naniesienia punktów.'
    container.innerHTML = events.length
      ? `<strong>Znaleziono ${events.length} otwartych zdarzeń pożarowych NASA EONET w promieniu ${radiusKm} km.${mapNote}</strong><ul>${list}</ul><small>Linia pokazuje kolejne położenia opublikowane dla zdarzenia, a nie dokładną granicę ognia.</small>`
      : `<strong>Brak otwartych zdarzeń pożarowych NASA EONET w promieniu ${radiusKm} km od ${place.name}.</strong><small>Zwiększ promień albo sprawdź inne miejsce.</small>`
  }

  async function mount() {
    const hero = await waitFor('.hero.compact')
    if (document.querySelector('.place-fire-search')) return
    const section = document.createElement('section')
    section.className = 'place-fire-search'
    section.innerHTML = `
      <div class="place-fire-head"><div><small>GLOBAL PLACE SEARCH · NASA EONET</small><h2>Znajdź miasto i obserwuj aktywne pożary</h2></div><span>BLISKO CZASU RZECZYWISTEGO</span></div>
      <form class="place-fire-form">
        <label>Miejscowość, miasto lub region<input name="place" type="search" placeholder="np. Valencia, Hiszpania" required autocomplete="off"></label>
        <label>Promień obserwacji<select name="radius"><option value="100">100 km</option><option value="250">250 km</option><option value="500" selected>500 km</option><option value="1000">1000 km</option><option value="2000">2000 km</option></select></label>
        <button type="submit">Pokaż miejsce i pożary na Ziemi 3D</button>
      </form>
      <div class="place-fire-status" aria-live="polite">Wpisz dowolne miasto lub miejscowość na świecie.</div>`
    hero.insertAdjacentElement('afterend', section)
    const form = section.querySelector('form')
    const status = section.querySelector('.place-fire-status')
    form.addEventListener('submit', async event => {
      event.preventDefault()
      const data = new FormData(form)
      const query = data.get('place').toString().trim()
      const radiusKm = Number(data.get('radius'))
      if (!query) return
      status.textContent = 'Wyszukiwanie miejsca i pobieranie danych NASA EONET…'
      try {
        const place = await geocode(query)
        state.place = place
        const events = await loadWildfires(place, radiusKm)
        status.textContent = `Znaleziono ${place.name}. Uruchamianie Ziemi 3D…`
        let mapReady = false
        try {
          await focusPlace(place)
          mapReady = addFireEntities(events)
        } catch (viewerError) {
          console.warn(viewerError)
        }
        renderResults(status, place, events, radiusKm, mapReady)
      } catch (error) {
        status.textContent = `Nie udało się wykonać wyszukiwania: ${error.message}`
      }
    })
  }

  mount().catch(console.error)
})()