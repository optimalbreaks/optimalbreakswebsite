'use client'

import { createContext } from 'react'

/** Referencia compartida del contexto; el tipo vive en DeckAudioProvider. */
export const DeckAudioContext = createContext<unknown>(null)
