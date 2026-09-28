// ============================================
// OPTIMAL BREAKS — Puente entre el aterrizaje de un tema compartido y ChartView
// ----------------------------------------------
// El emergente de aterrizaje (SharedTrackLanding) se pinta ANTES de que
// ChartView cargue la semana/año del tema. Cuando ChartView ya tiene la cola
// completa de esa sección, la registra aquí:
//  - si el receptor aún no ha tocado play, el emergente usa la cola completa;
//  - si ya está sonando el tema suelto, ChartView amplía la cola sin cortarlo
//    (mismo `src` ⇒ el motor no reinicia el audio).
// ============================================

import type { PreviewTrack } from '@/components/DeckAudioProvider'

export type SharedBundle = {
  sectionKey: string
  bundle: PreviewTrack[]
  index: number
}

const bundles = new Map<string, SharedBundle>()

export function registerSharedBundle(rowKey: string, reg: SharedBundle): void {
  bundles.set(rowKey, reg)
}

export function getSharedBundle(rowKey: string): SharedBundle | null {
  return bundles.get(rowKey) ?? null
}
