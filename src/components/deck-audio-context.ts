'use client'

import { createContext } from 'react'

/** Referencia compartida del contexto; el tipo vive en DeckAudioProvider. */
export const DeckAudioContext = createContext<unknown>(null)

/**
 * Contexto SEPARADO para los valores de alta frecuencia del reproductor
 * (progreso/duración de preview, deck y mix + rotación de los platos).
 * Cambian ~8 veces/segundo (y las rotaciones a 60 fps) mientras suena algo:
 * si viajaran en `DeckAudioContext`, cada tick re-renderizaría TODOS sus
 * consumidores (ChartView entero, TracksSection, Top 100…), que es lo que
 * producía el lag general de la página y el botón "+" de Mis Tracks
 * quedándose obsoleto hasta el siguiente input. Solo deben suscribirse las
 * mini barras del reproductor y el deck de la portada.
 */
export const DeckAudioProgressContext = createContext<unknown>(null)
