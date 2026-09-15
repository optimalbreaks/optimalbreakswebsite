// ============================================
// OPTIMAL BREAKS — Loading State (global de rutas)
// Cargador fanzine compartido con barra de progreso: nadie espera una
// navegación sin feedback. El idioma lo deduce LoadingBreaks del pathname.
// ============================================

import LoadingBreaks from '@/components/LoadingBreaks'

export default function Loading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <LoadingBreaks />
    </div>
  )
}
