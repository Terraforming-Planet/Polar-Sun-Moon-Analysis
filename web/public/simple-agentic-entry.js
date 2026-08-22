(() => {
  const BUTTON_ATTR = 'data-agentic-eo-simple-entry'

  function findButtonByText(root, text) {
    return [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === text) ?? null
  }

  function openAgenticEO() {
    const switchBar = document.querySelector('.simple-shell .mode-switch-bar')
    const advancedButton = switchBar ? findButtonByText(switchBar, 'Open Advanced view') : null
    if (!advancedButton) return

    advancedButton.click()

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const nav = document.querySelector('.main-tabs')
      const agenticButton = nav ? findButtonByText(nav, 'Agentic EO') : null
      if (agenticButton) {
        window.clearInterval(timer)
        agenticButton.click()
        agenticButton.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      } else if (attempts >= 40) {
        window.clearInterval(timer)
      }
    }, 50)
  }

  function ensureButton() {
    const switchBar = document.querySelector('.simple-shell .mode-switch-bar')
    if (!switchBar || switchBar.querySelector(`[${BUTTON_ATTR}]`)) return

    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(BUTTON_ATTR, 'true')
    button.setAttribute('aria-label', 'Open Agentic EO multi-agent research')
    button.textContent = 'Agentic EO'
    button.addEventListener('click', openAgenticEO)

    const advancedButton = findButtonByText(switchBar, 'Open Advanced view')
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
