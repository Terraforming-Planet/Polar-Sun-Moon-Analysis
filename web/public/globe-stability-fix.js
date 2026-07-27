(() => {
  const disableHardTerminator = () => {
    const labels = [...document.querySelectorAll('label')]
    const dayNightLabel = labels.find(label => /dzień\s*\/\s*noc/i.test(label.textContent || ''))
    const checkbox = dayNightLabel?.querySelector('input[type="checkbox"]')
    if (checkbox?.checked) checkbox.click()

    const viewer = window.__terraPlaceFireSearch?.viewer
    if (viewer && !viewer.isDestroyed?.()) {
      viewer.scene.globe.enableLighting = false
      viewer.scene.requestRender()
    }
  }

  const makeViewerAvailable = () => {
    const viewer = window.__terraPlaceFireSearch?.viewer
    if (!viewer || viewer.isDestroyed?.()) return false
    window.dispatchEvent(new CustomEvent('terra:viewer-ready', { detail: { viewer } }))
    return true
  }

  const observer = new MutationObserver(() => {
    disableHardTerminator()
    makeViewerAvailable()
  })

  observer.observe(document.documentElement, { childList: true, subtree: true })
  window.addEventListener('terra:viewer-ready', disableHardTerminator)
  window.setInterval(() => {
    disableHardTerminator()
    makeViewerAvailable()
  }, 500)

  disableHardTerminator()
})()
