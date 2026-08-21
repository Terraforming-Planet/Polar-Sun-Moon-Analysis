type LegacyModule = {
  title: string
  path: string
  description: string
}

type LegacyGroup = {
  title: string
  description: string
  modules: LegacyModule[]
}

const experiments: LegacyModule[] = Array.from({ length: 16 }, (_, index) => {
  const number = String(index + 1).padStart(3, '0')
  return {
    title: `Experiment ${number}`,
    path: `experiment-${number}/`,
    description: 'Zachowany moduł badawczy ze starszej wersji strony. Otwiera oryginalny widok i jego opublikowane dane.',
  }
})

const groups: LegacyGroup[] = [
  {
    title: 'Ziemia, satelity i monitoring',
    description: 'Starsze niezależne widoki obserwacji Ziemi, satelitów i map pomocniczych.',
    modules: [
      { title: 'Copernicus', path: 'copernicus/', description: 'Starszy panel wyników i danych Copernicus.' },
      { title: 'Flood map', path: 'flood-map/', description: 'Interaktywna mapa porównawcza Sentinel-1 przed / po.' },
      { title: 'Multi-angle', path: 'multi-angle/', description: 'Wielokątowe i wielokierunkowe widoki obserwacyjne.' },
      { title: 'Constellation', path: 'constellation/', description: 'Starszy moduł konstelacji i obserwacji satelitarnych.' },
      { title: 'Earth–Space 512', path: 'earth-space-512/', description: 'Model badawczy Ziemia–przestrzeń oparty o siatkę 512.' },
      { title: 'Investigation', path: 'investigation/', description: 'Starszy warsztat badawczy / investigation.' },
      { title: 'Research', path: 'research/', description: 'Archiwalny panel badań i materiałów projektu.' },
      { title: 'River helper map', path: 'river-helper-map/', description: 'Mapa pomocnicza państw, rzek i przepływów.' },
    ],
  },
  {
    title: 'Woda, stacje i teren',
    description: 'Zachowane moduły hydrologiczne, terenowe i stacje badawcze.',
    modules: [
      { title: 'Water local', path: 'water-local/', description: 'Lokalne badania wody i porównania obszarów.' },
      { title: 'Water casebook', path: 'water-casebook/', description: 'Archiwum przypadków i serii badań wody.' },
      { title: 'Sahara station', path: 'sahara-station/', description: 'Stacja badawcza Sahara i jej starszy model.' },
      { title: 'Ocean station', path: 'ocean-station/', description: 'Zachowany moduł stacji oceanicznej.' },
      { title: 'Eclipse archive', path: 'eclipse/', description: 'Starsza sekcja obserwacji zaćmień.' },
      { title: 'Eclipse live', path: 'eclipse-live/', description: 'Opublikowany moduł obserwacji zaćmienia na żywo i galeria.' },
      { title: 'Community forum', path: 'forum/', description: 'Zachowany moduł forum projektu.' },
    ],
  },
  {
    title: 'Arctic 90°N — laboratoria',
    description: 'Pełny zestaw zachowanych widoków stacji i eksperymentów arktycznych.',
    modules: [
      { title: 'Arctic 90°N', path: 'arctic-90n/', description: 'Główna strona arktycznej stacji badawczej.' },
      { title: 'Real Ice Lab', path: 'arctic-90n/real-ice-lab.html', description: 'Laboratorium lodu i model 3D.' },
      { title: 'Measurement gap', path: 'arctic-90n/measurement-gap.html', description: 'Widok luk pomiarowych i ograniczeń danych.' },
      { title: 'Risk demo', path: 'arctic-90n/risk-demo.html', description: 'Demonstrator ryzyka dla stacji 90°N.' },
      { title: 'Risk simulation', path: 'arctic-90n/risk-simulation.html', description: 'Starszy moduł symulacji ryzyka.' },
      { title: 'Hidden water lesson', path: 'arctic-90n/lesson-hidden-water.html', description: 'Lekcja badawcza o ukrytej wodzie.' },
      { title: 'Mini experiments lab', path: 'arctic-90n/mini-experiments-lab.html', description: 'Zestaw mini-eksperymentów stacji.' },
    ],
  },
  {
    title: 'Raporty, dane i treningi L4',
    description: 'Starsze publiczne wyniki, dane pomocnicze i trzy opublikowane przebiegi treningowe.',
    modules: [
      { title: 'Copernicus analysis report', path: 'reports/copernicus-analysis.html', description: 'Opublikowany raport analizy Copernicus.' },
      { title: 'Observation timeline', path: 'charts/copernicus/observation_timeline.png', description: 'Opublikowana oś czasu obserwacji Copernicus.' },
      { title: 'Copernicus JSON data', path: 'data/copernicus/latest_results.json', description: 'Publiczne dane wynikowe używane przez starszy panel.' },
      { title: 'L4 Training #1', path: 'published/l4-training-2026-08-19/', description: 'Pierwszy opublikowany raport treningu NVIDIA L4.' },
      { title: 'L4 Training #2 · Site Corpus', path: 'published/training-runs/site_20260819T223835Z/', description: 'Opublikowany trening korpusu strony.' },
      { title: 'L4 Training #3 · Streaming NASA GIBS', path: 'published/training-runs/stream_gibs_20260820T013036Z/', description: 'Opublikowany trening strumieniowych danych NASA GIBS.' },
    ],
  },
  {
    title: 'Archiwum eksperymentów 001–016',
    description: 'Wszystkie opublikowane stare strony eksperymentów pozostają dostępne z jednego miejsca.',
    modules: experiments,
  },
]

function legacyHref(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`
}

export function AdvancedLegacyPanel() {
  const total = groups.reduce((sum, group) => sum + group.modules.length, 0)
  return <section className="workspace legacy-modules" aria-label="Legacy modules available in Advanced view">
    <div className="workspace-head">
      <div>
        <small>ADVANCED · ZACHOWANE MODUŁY STAREJ STRONY</small>
        <h1>Stare zakładki i laboratoria</h1>
      </div>
      <span className="evidence-badge observation">{total} ZACHOWANYCH WEJŚĆ</span>
    </div>
    <p className="notice"><b>Nic nie usuwamy.</b> Nowy interfejs zostaje prosty, a stare zakładki, eksperymenty i samodzielne laboratoria są dostępne tutaj w trybie Zaawansowanym. Moduły archiwalne mogą mieć starszy wygląd, ale nadal otwierają opublikowane zasoby projektu.</p>
    {groups.map(group => <section key={group.title} className="legacy-module-group">
      <div className="section-title"><div><small>LEGACY MODULE GROUP</small><h2>{group.title}</h2><p className="muted">{group.description}</p></div></div>
      <div className="cards legacy-module-grid">
        {group.modules.map(module => <article key={module.path}>
          <h2>{module.title}</h2>
          <p>{module.description}</p>
          <a className="button-link block" href={legacyHref(module.path)}>Otwórz moduł</a>
          <small className="muted">/{module.path}</small>
        </article>)}
      </div>
    </section>)}
  </section>
}

export const ADVANCED_LEGACY_PATHS = groups.flatMap(group => group.modules.map(module => module.path))
