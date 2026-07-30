(() => {
  const ROOT_SELECTOR = '.location-globe-shell'
  const CANVAS_SELECTOR = '.realistic-earth-globe canvas'

  function dispatchZoom(canvas, direction) {
    const deltaY = direction === 'in' ? -240 : 240
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaY,
      bubbles: true,
      cancelable: true,
      clientX: canvas.clientWidth / 2,
      clientY: canvas.clientHeight / 2,
    }))
  }

  function install(shell) {
    if (shell.querySelector('.globe-zoom-buttons')) return

    const controls = document.createElement('div')
    controls.className = 'globe-zoom-buttons'
    controls.setAttribute('aria-label', 'Sterowanie przybliżeniem globu')

    const zoomIn = document.createElement('button')
    zoomIn.type = 'button'
    zoomIn.className = 'globe-zoom-button'
    zoomIn.textContent = '+'
    zoomIn.setAttribute('aria-label', 'Przybliż glob')

    const zoomOut = document.createElement('button')
    zoomOut.type = 'button'
    zoomOut.className = 'globe-zoom-button'
    zoomOut.textContent = '−'
    zoomOut.setAttribute('aria-label', 'Oddal glob')

    const zoom = direction => {
      const canvas = shell.querySelector(CANVAS_SELECTOR)
      if (canvas) dispatchZoom(canvas, direction)
    }

    zoomIn.addEventListener('click', () => zoom('in'))
    zoomOut.addEventListener('click', () => zoom('out'))
    controls.append(zoomIn, zoomOut)
    shell.appendChild(controls)
  }

  const style = document.createElement('style')
  style.textContent = `
    .globe-zoom-buttons {
      position: absolute;
      z-index: 8;
      right: 12px;
      bottom: 12px;
      display: grid;
      gap: 8px;
    }
    .globe-zoom-button {
      width: 48px;
      height: 48px;
      border: 1px solid rgba(121, 214, 255, .7);
      border-radius: 12px;
      background: rgba(4, 25, 43, .94);
      color: #ecfaff;
      font: 800 28px/1 system-ui, sans-serif;
      box-shadow: 0 8px 24px rgba(0, 0, 0, .35);
      touch-action: manipulation;
    }
    .globe-zoom-button:active { transform: scale(.94); }
    @media (max-width: 600px) {
      .globe-zoom-buttons { right: 10px; bottom: 10px; }
      .globe-zoom-button { width: 52px; height: 52px; }
    }
  `
  document.head.appendChild(style)

  const scan = () => document.querySelectorAll(ROOT_SELECTOR).forEach(install)
  scan()
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true })
})()
