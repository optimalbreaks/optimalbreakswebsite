// Textos de las campañas. Lo usa el panel (cliente) y el generador (servidor).
// Sin Nodemailer ni claves: si no, el navegador no puede importarlo.

import type { MailCampaignAudience, MailCampaignPreset } from '@/types/database'

const SITE = 'https://www.optimalbreaks.com'

export const PRESET_ORDER: MailCampaignPreset[] = ['top10', 'octubre', 'montar', 'funciones', 'libre']

export const AUDIENCE_LABELS: Record<MailCampaignAudience, string> = {
  confirmed: 'Cuentas confirmadas',
  sin_lista: 'Sin lista montada (0 temas)',
  lista_corta: 'Lista a medias (1–99)',
  con_lista: 'Ya tienen lista',
}

type PresetSeed = {
  label: string
  subject: string
  audience: MailCampaignAudience
  briefing: string
}

export function presetSeed(preset: MailCampaignPreset, year: number): PresetSeed {
  const baja = 'Saluda con {{NOMBRE}}. El pie lleva el enlace {{BAJA_URL}}. No escribas otro sistema de baja.'
  const cifras = 'Prohibido citar votos, fans, escuchas o cuánta gente sostiene un puesto. Esas cifras no están en el contexto y no se inventan.'
  if (preset === 'top10') {
    return {
      label: 'Top 10',
      subject: 'El Top 10 de Optimal Breaks',
      audience: 'confirmed',
      briefing: `Mail del Top 10 de la comunidad: los 10 temas y los 10 artistas de CONTEXTO.top10, en ese orden, cada uno con su enlace.\n${cifras}\nTono fanzine, cercano. Español primero y, debajo, un bloque corto en inglés.\n${baja}`,
    }
  }
  if (preset === 'octubre') {
    return {
      label: 'Tops de octubre',
      subject: `Los tops de octubre ${year}`,
      audience: 'confirmed',
      briefing: `Repaso de octubre ${year}. Usa solo CONTEXTO.octubre (temas y artistas guardados del 1 al 31).\nSi esa lista viene vacía o corta, dilo y apóyate en el Top 10 general, sin fabricar un ranking mensual.\n${cifras}\nEspañol primero y un bloque corto en inglés.\n${baja}`,
    }
  }
  if (preset === 'montar') {
    return {
      label: 'Recordatorio: montar',
      subject: 'Tu lista en Optimal Breaks todavía no está montada',
      audience: 'sin_lista',
      briefing: `Recordatorio a quien aún no ha montado su lista.\nPasos cortos, con estos enlaces y ningún otro: entrar en la web, pulsar + en un tema, ver la lista en ${SITE}/es/mi-cuenta/tracks. Esa lista es la que arma el Top (${SITE}/es/topalltimes).\nSi cabe, una línea: un artista reclama su ficha en ${SITE}/es/mi-cuenta/artista.\nPuedes usar {{SAVES}}: en esta audiencia será 0.\nNo digas cuánta gente ya tiene lista ni cifras del ranking.\nEspañol primero y un bloque corto en inglés.\n${baja}`,
    }
  }
  if (preset === 'funciones') {
    return {
      label: 'Funcionalidades',
      subject: 'Qué puedes hacer en Optimal Breaks',
      audience: 'confirmed',
      briefing: `Guía corta de la web. Una tarjeta por cada entrada de CONTEXTO.funciones, con su URL exacta. No añadas páginas que no estén en esa lista.\nExplica en una frase qué se hace ahí. El + y Mis Tracks van los primeros.\nEspañol primero y un bloque corto en inglés.\n${baja}`,
    }
  }
  return { label: 'Libre', subject: '', audience: 'confirmed', briefing: '' }
}

export function isPreset(value: string): value is MailCampaignPreset {
  return (PRESET_ORDER as string[]).includes(value)
}

export function isAudience(value: string): value is MailCampaignAudience {
  return value in AUDIENCE_LABELS
}
