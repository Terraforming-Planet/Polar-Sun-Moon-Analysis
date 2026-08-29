import './forgemcp-panel.css'

const forgeRepository = 'https://github.com/Terraforming-Planet/ForgeMCP-Multi-Agent-Research---Game-Studio'
const cubeChess = 'https://teslaeco.github.io/Cube-Chess-512-AI-Open-Source-3D-Chess-Engine-Autonomous-AI-Game-Developer/'

export function ForgeMCPPanel({ baseUrl }: { baseUrl: string }) {
  const architecture = [
    'HUMAN',
    'FORGEMCP COORDINATOR',
    'SPECIALIST AGENTS',
    'WEBMCP TOOLS',
    'TERRA',
    'REAL DATA / DETERMINISTIC ANALYSIS',
    'VERIFICATION',
    'HUMAN DECISION',
  ]
  const scientificClasses = ['OBSERVATION', 'ANOMALY', 'HYPOTHESIS', 'PRELIMINARY RISK ALERT', 'VERIFIED FINDING', 'INSUFFICIENT DATA']

  return <section className="workspace forgemcp-workspace" aria-labelledby="forgemcp-title">
    <div className="workspace-head">
      <div><small>WEBMCP CHALLENGE · HUMAN-CONTROLLED AGENT WORKFLOWS</small><h1 id="forgemcp-title">ForgeMCP — Multi-Agent Research &amp; Game Studio</h1></div>
      <span className="evidence-badge observation">FOUNDATION IMPLEMENTED</span>
    </div>
    <p className="forgemcp-pillars">Observe the Real World <b>·</b> Learn &amp; Compete <b>·</b> Create <b>·</b> Verify</p>
    <p className="notice"><b>Transparent project boundary:</b> Terra is a pre-existing real Earth-observation laboratory. ForgeMCP is new WebMCP Challenge work that adds controlled, agent-facing paths without replacing Terra’s real data, provenance, deterministic analysis or scientific guardrails.</p>

    <div className="forgemcp-flow" aria-label={architecture.join(' then ')}>
      {architecture.map((step, index) => <div className="forgemcp-flow-step" key={step}><span>{step}</span>{index < architecture.length - 1 && <b aria-hidden="true">→</b>}</div>)}
    </div>

    <div className="cards forgemcp-status-grid">
      <article><small>IMPLEMENTED WHERE SUPPORTED</small><h2>WebMCP foundation</h2><p>Runtime detection and the <code>document.modelContext.registerTool(...)</code> registration path are implemented where the browser supports them.</p></article>
      <article><small>INITIAL / PARTIAL BOUNDARIES</small><h2>Current tool scope</h2><p><code>search_location</code> uses OpenStreetMap Nominatim, and <code>find_observations</code> uses NASA EONET. These are initial, partial tool boundaries—not a claim that every Terra capability is connected.</p></article>
      <article><small>TRUTHFUL CONNECTION STATUS</small><h2>Further Terra tools</h2><p>Further Terra tools are not claimed connected until their real implementations, inputs, provenance, outputs and verification paths are present and tested.</p></article>
    </div>

    <section className="forgemcp-classes" aria-labelledby="forgemcp-classes-title">
      <div><small>SCIENTIFIC OUTPUT CLASSES</small><h2 id="forgemcp-classes-title">Evidence and uncertainty stay explicit</h2></div>
      <div className="forgemcp-class-list">{scientificClasses.map(label => <span key={label}>{label}</span>)}</div>
      <p>Preliminary risk alerts require independent verification and field verification as appropriate before they can support consequential human decisions.</p>
    </section>

    <div className="hero-actions forgemcp-actions">
      <a className="button-link" href={forgeRepository} target="_blank" rel="noreferrer">ForgeMCP repository ↗</a>
      <a className="button-link" href={`${baseUrl}forgemcp/`}>Open public ForgeMCP page</a>
      <a className="button-link" href={cubeChess} target="_blank" rel="noreferrer">Open Cube Chess ↗</a>
    </div>
  </section>
}
