(() => {
  const BUTTON_ATTR = 'data-agentic-eo-simple-entry'
  const OVERVIEW_ATTR = 'data-agentic-eo-simple-overview'
  const STYLE_ID = 'simple-agentic-eo-style'

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

  function openAgenticEO() {
    const advancedButton = advancedViewButton()
    if (!advancedButton) return

    advancedButton.click()

    let attempts = 0
    const timer = window.setInterval(() => {
      attempts += 1
      const agenticButton = agenticTabButton()
      if (agenticButton) {
        window.clearInterval(timer)
        agenticButton.click()
        window.setTimeout(() => {
          const workspace = document.querySelector('.control-center-app main .workspace')
          workspace?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 80)
      } else if (attempts >= 60) {
        window.clearInterval(timer)
      }
    }, 50)
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return
    const style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = `
      .simple-agentic-overview{margin:18px 14px 22px;padding:20px;border:1px solid rgba(55,214,255,.34);border-radius:16px;background:linear-gradient(145deg,rgba(4,24,39,.97),rgba(3,13,25,.97));box-shadow:0 0 34px rgba(0,174,255,.08)}
      .simple-agentic-overview .simple-agentic-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}
      .simple-agentic-overview .simple-agentic-head small{letter-spacing:.1em;color:#68d8ff;font-weight:700}
      .simple-agentic-overview .simple-agentic-head h2{margin:5px 0 8px;font-size:clamp(1.35rem,4vw,2rem)}
      .simple-agentic-overview .simple-agentic-head p{max-width:850px;margin:0;color:#b9ccda;line-height:1.6}
      .simple-agentic-badge{display:inline-flex;align-items:center;border:1px solid rgba(67,255,171,.5);border-radius:999px;padding:7px 11px;color:#7fffc0;background:rgba(15,96,62,.18);font-size:.72rem;font-weight:800;white-space:nowrap}
      .simple-agentic-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}
      .simple-agentic-flow article,.simple-agentic-evidence article{border:1px solid rgba(77,162,203,.24);border-radius:13px;padding:14px;background:rgba(5,25,39,.72)}
      .simple-agentic-flow h3,.simple-agentic-evidence h3{margin:0 0 7px;color:#effaff;font-size:1rem}
      .simple-agentic-flow p,.simple-agentic-evidence p{margin:0;color:#aebfcd;line-height:1.5;font-size:.9rem}
      .simple-agentic-evidence{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:10px 0 16px}
      .simple-agentic-evidence code{color:#83e6ff;font-size:.82em;overflow-wrap:anywhere}
      .simple-agentic-actions{display:flex;gap:9px;flex-wrap:wrap;align-items:center}
      .simple-agentic-actions button,.simple-agentic-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:8px 13px;border-radius:8px;border:1px solid rgba(56,200,255,.45);background:rgba(10,62,89,.62);color:#eaf9ff;text-decoration:none;font:inherit;font-size:.84rem;cursor:pointer}
      .simple-agentic-actions button{background:linear-gradient(135deg,rgba(0,161,219,.76),rgba(15,119,180,.7));font-weight:800}
      @media(max-width:720px){.simple-agentic-overview{margin:12px 8px 18px;padding:14px}.simple-agentic-flow,.simple-agentic-evidence{grid-template-columns:1fr}.simple-agentic-actions>*{width:100%}}
    `
    document.head.appendChild(style)
  }

  function ensureButton() {
    const switchBar = simpleSwitchBar()
    if (!switchBar || switchBar.querySelector(`[${BUTTON_ATTR}]`)) return

    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute(BUTTON_ATTR, 'true')
    button.setAttribute('aria-label', 'Open Agentic EO multi-agent research')
    button.textContent = 'Agentic EO'
    button.addEventListener('click', openAgenticEO)

    const advancedButton = advancedViewButton()
    if (advancedButton) switchBar.insertBefore(button, advancedButton)
    else switchBar.appendChild(button)
  }

  function ensureOverview() {
    const shell = document.querySelector('.simple-shell')
    const main = shell?.querySelector('main')
    if (!shell || !main || shell.querySelector(`[${OVERVIEW_ATTR}]`)) return

    const section = document.createElement('section')
    section.className = 'simple-agentic-overview'
    section.setAttribute(OVERVIEW_ATTR, 'true')
    section.setAttribute('aria-label', 'Agentic EO multi-agent Earth observation overview')
    section.innerHTML = `
      <div class="simple-agentic-head">
        <div>
          <small>OPENAI AGENTS SDK · PROVENANCE-FIRST EARTH OBSERVATION</small>
          <h2>Agentic EO — AI research that plans, checks sources and preserves uncertainty</h2>
          <p>Terra Observation uses a manager-style multi-agent workflow for Earth-observation research. Instead of asking one model to answer everything from memory, the coordinator delegates source selection and evidence verification to specialist agents, then reports what is known, what is derived and what still needs to be measured.</p>
        </div>
        <span class="simple-agentic-badge">LIVE SDK RUN PUBLISHED</span>
      </div>

      <div class="simple-agentic-flow">
        <article><h3>1 · Terra Agentic EO Coordinator</h3><p>Breaks a research question into steps, chooses which specialist to call, combines tool results and produces an evidence-aware answer with uncertainty and recommended next checks.</p></article>
        <article><h3>2 · EO Source Scout</h3><p>Searches the controlled source registry first. It can recommend official/public missions such as Sentinel-1 SAR, Sentinel-2 optical imagery, Landsat and SWOT when their documented capabilities match the research problem.</p></article>
        <article><h3>3 · EO Evidence Verifier</h3><p>Reads repository-backed evidence and claim flags before conclusions are written. It prevents a visual suspicion, training result or catalogue entry from being silently promoted into an environmental finding.</p></article>
      </div>

      <div class="simple-agentic-evidence">
        <article><h3>Vistula TEST 014 · real live run</h3><p>The published Vistula Gniew–Grudziądz run contains 74 evidence records, with 72 accepted. It establishes dataset integrity and temporal coverage. It deliberately keeps <code>environmental_finding_claim=false</code>, <code>water_loss_claim=false</code> and <code>causal_claim=false</code> because a separate reproducible measurement is required before those claims can be made.</p></article>
        <article><h3>Provenance before model memory</h3><p>Sentinel-1, Sentinel-2, Landsat and SWOT are selected through a deterministic registry containing agency, mission, instrument, access, temporal coverage, resolution and limitations. A registry entry does not mean that a scene has already been downloaded or analysed.</p></article>
        <article><h3>Scientific uncertainty is explicit</h3><p>The workflow separates observation, derived value, model estimate, hypothesis and unknown. Candidate morphology such as exposed bed, sandbars or channel constriction is not treated as proof of water loss or a physical cause without supporting measurements.</p></article>
        <article><h3>Public trace without private reasoning</h3><p>The allow-listed execution trace proves that the Coordinator called the EO Source Scout and EO Evidence Verifier. It records agent/tool events and success state, while excluding chain-of-thought, credentials, prompts and private tool payloads.</p></article>
      </div>

      <div class="simple-agentic-actions">
        <button type="button" data-open-agentic-eo>Open full Agentic EO research</button>
        <a href="${new URL('published/agentic-eo/vistula-test-014-live.json', window.location.href).href}" target="_blank" rel="noreferrer">Open structured TEST 014 evidence ↗</a>
        <a href="https://github.com/Terraforming-Planet/Polar-Sun-Moon-Analysis/blob/main/docs/ESA_AGENTIC_EO.md" target="_blank" rel="noreferrer">Architecture & scientific guardrails ↗</a>
      </div>
    `

    section.querySelector('[data-open-agentic-eo]')?.addEventListener('click', openAgenticEO)
    shell.insertBefore(section, main)
  }

  function ensureInterface() {
    ensureStyles()
    ensureButton()
    ensureOverview()
  }

  const observer = new MutationObserver(ensureInterface)
  observer.observe(document.documentElement, { childList: true, subtree: true })

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureInterface, { once: true })
  } else {
    ensureInterface()
  }
})()
