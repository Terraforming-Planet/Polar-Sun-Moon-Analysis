(() => {
  const BUTTON_ATTR = 'data-agentic-eo-simple-entry'

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

  const observer = new MutationObserver(ensureButton)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureButton, { once: true })
  } else {
    ensureButton()
  }
})()
