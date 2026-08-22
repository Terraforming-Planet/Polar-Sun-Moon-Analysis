(() => {
  const BUTTON_ATTR = 'data-agentic-eo-simple-entry'
  const DETAILS_ATTR = 'data-agentic-eo-advanced-details'

  function simpleSwitchBar() {
    return document.querySelector('.simple-shell .mode-switch-bar')
  }

  function advancedViewButton() {
    const switchBar = simpleSwitchBar()
    if (!switchBar) return null
    const buttons = [...switchBar.querySelectorAll('button')]
    return buttons.find(button => !button.hasAttribute(BUTTON_ATTR)) ?? null
  }

  function agenticTabButton() {
    const nav = document.querySelector('.main-tabs')
    if (!nav) return null
    const buttons = [...nav.querySelectorAll('button')]
    return buttons.find(button => button.textContent?.includes('Agentic EO')) ?? buttons[1] ?? null
  }

  function fireRealClick(button) {
    button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch' }))
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch' }))
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    button.click()
  }

  function openAgenticEO() {
    const advancedButton = advancedViewButton()
    if (!advancedButton) return

    fireRealClick(advancedButton)

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const agenticButton = agenticTabButton()
      if (agenticButton) {
        window.clearInterval(timer)
        fireRealClick(agenticButton)
        window.setTimeout(() => {
          ensureAdvancedDetails()
          const workspace = document.querySelector('.control-center-app main .workspace')
          workspace?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
      } else if (attempts >= 80) {
        window.clearInterval(timer)
      }
    }, 50)
  }

  function ensureButton() {
    const switchBar = simpleSwitchBar()
    if (!switchBar || switchBar.querySelector(`[${BUTTON_ATTR}]`)) return

    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(BUTTON_ATTR, 'true')
    button.setAttribute('aria-label', 'Open Agentic EO multi-agent research')
    button.style.touchAction = 'manipulation'
    button.textContent = 'Agentic EO'
    button.addEventListener('click', openAgenticEO)
    button.addEventListener('touchend', event => {
      event.preventDefault()
      openAgenticEO()
    }, { passive: false })

    const advancedButton = advancedViewButton()
    if (advancedButton) switchBar.insertBefore(button, advancedButton)
    else switchBar.appendChild(button)
  }

  function ensureAdvancedDetails() {
    if (document.querySelector('.simple-shell')) return
    const agenticButton = agenticTabButton()
    if (!agenticButton?.classList.contains('active')) return

    const main = document.querySelector('.control-center-app main')
    const workspaces = main ? [...main.querySelectorAll('.workspace')] : []
    const workspace = workspaces.find(section => section.querySelector('h1')?.textContent?.includes('Agentic EO'))
    if (!workspace || workspace.querySelector(`[${DETAILS_ATTR}]`)) return

    const details = document.createElement('div')
    details.className = 'cards'
    details.setAttribute(DETAILS_ATTR, 'true')
    details.innerHTML = `
      <article><h2>Provenance before model memory</h2><p>Sentinel-1, Sentinel-2, Landsat and SWOT are selected through a deterministic registry containing agency, mission, instrument, access, temporal coverage, resolution and limitations. A registry entry does not mean that a scene has already been downloaded or analysed.</p></article>
      <article><h2>Scientific uncertainty is explicit</h2><p>The workflow separates observation, derived value, model estimate, hypothesis and unknown. Exposed bed, sandbars or channel constriction are not treated as proof of water loss or a physical cause without supporting measurements.</p></article>
      <article><h2>How the agents work together</h2><p>The Coordinator receives the research objective, asks Source Scout which controlled EO sources can answer it, asks Evidence Verifier what the repository evidence actually supports, and only then prepares a response with uncertainty and recommended next checks.</p></article>
      <article><h2>What TEST 014 does not prove</h2><p>The current evidence does not by itself prove long-term water loss, blocked river flow or a causal mechanism. Those questions require reproducible image measurements, matched seasons, hydrological observations and checks against alternative explanations.</p></article>
    `
    workspace.appendChild(details)
  }

  function ensureInterface() {
    ensureButton()
    ensureAdvancedDetails()
  }

  const observer = new MutationObserver(ensureInterface)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureInterface, { once: true })
  } else {
    ensureInterface()
  }
})()
