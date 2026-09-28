// ============================================
// OPTIMAL BREAKS — /charts loading boundary
// ----------------------------------------------
// Mismo cargador fanzine que el Top 100 (`LoadingBreaks`). Sale al instante
// mientras el servidor monta el esquema de semanas y años; los temas de cada
// sección se piden luego al abrirla (carga progresiva, `ChartView`).
// ============================================

import LoadingBreaks from '@/components/LoadingBreaks'

export default function ChartsLoading() {
  return (
    <main className="min-h-screen bg-[var(--paper)]">
      <div className="max-w-4xl mx-auto px-4 py-16 sm:py-24">
        <LoadingBreaks
          title={{ es: 'Cargando los charts', en: 'Loading the charts' }}
          subtitle={{ es: 'Montando semanas y archivo por año', en: 'Building weeks and the archive by year' }}
        />
      </div>
    </main>
  )
}
