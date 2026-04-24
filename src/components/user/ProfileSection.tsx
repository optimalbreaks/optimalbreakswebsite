// ============================================
// OPTIMAL BREAKS — Profile section (display name, bio, country, favorite genre)
// ============================================

'use client'

import { useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { useProfile } from '@/hooks/useUserData'

export default function ProfileSection({ lang }: { lang: string }) {
  const { profile, update } = useProfile()
  const { user, signOut } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ display_name: '', bio: '', country: '', favorite_genre: '' })
  const [savingFlag, setSavingFlag] = useState(false)
  const es = lang === 'es'

  const startEdit = () => {
    if (profile) {
      setForm({
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        country: profile.country || '',
        favorite_genre: profile.favorite_genre || '',
      })
    }
    setEditing(true)
  }

  const save = async () => {
    await update(form as any)
    setEditing(false)
  }

  // Toggle de visibilidad para Almas Gemelas / Top mensual.
  // Si la columna aún no existe en BD (migración no aplicada) tratamos
  // `undefined` como `true` (default del DEFAULT en SQL) para no romper
  // el render. Al guardar mandamos boolean explícito.
  const isTracksPublic = profile?.is_tracks_public !== false
  const toggleTracksPublic = async () => {
    if (!profile) return
    setSavingFlag(true)
    try {
      await update({ is_tracks_public: !isTracksPublic })
    } finally {
      setSavingFlag(false)
    }
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '16px' }}>
        {es ? 'MI PERFIL' : 'MY PROFILE'}
      </h2>

      <div className="border-4 border-[var(--ink)] p-6">
        {!editing ? (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-[var(--red)] text-white flex items-center justify-center" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '24px' }}>
                {(profile?.display_name || user?.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
                  {profile?.display_name || 'Breaker'}
                </div>
                <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                  {user?.email}
                </div>
              </div>
            </div>
            {profile?.bio && <p className="mb-2" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}>{profile.bio}</p>}
            {profile?.country && <span className="cutout fill">{profile.country}</span>}
            {profile?.favorite_genre && <span className="cutout red">{profile.favorite_genre}</span>}
            <div className="mt-4 flex gap-2">
              <button onClick={startEdit} className="cutout outline" style={{ cursor: 'pointer' }}>{es ? 'EDITAR' : 'EDIT'}</button>
              <button onClick={() => { void signOut() }} className="cutout red" style={{ cursor: 'pointer' }}>{es ? 'CERRAR SESIÓN' : 'LOG OUT'}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input placeholder={es ? 'Nombre' : 'Display name'} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }} />
            <input placeholder="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }} />
            <input placeholder={es ? 'País' : 'Country'} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }} />
            <input placeholder={es ? 'Género favorito' : 'Favorite genre'} value={form.favorite_genre} onChange={(e) => setForm({ ...form, favorite_genre: e.target.value })} className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }} />
            <div className="flex gap-2">
              <button onClick={save} className="cutout red" style={{ cursor: 'pointer' }}>{es ? 'GUARDAR' : 'SAVE'}</button>
              <button onClick={() => setEditing(false)} className="cutout outline" style={{ cursor: 'pointer' }}>{es ? 'CANCELAR' : 'CANCEL'}</button>
            </div>
          </div>
        )}
      </div>

      {/* ============================================ */}
      {/* Privacidad — visibilidad para Almas Gemelas  */}
      {/* ============================================ */}
      <div className="mt-6 border-4 border-[var(--ink)] p-6">
        <h3
          className="font-black mb-2"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontSize: '14px',
            textTransform: 'uppercase',
          }}
        >
          {es ? 'PRIVACIDAD' : 'PRIVACY'}
        </h3>

        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isTracksPublic}
            disabled={savingFlag || !profile}
            onChange={toggleTracksPublic}
            className="mt-1 w-5 h-5 accent-[var(--red)] cursor-pointer shrink-0"
          />
          <span>
            <span
              className="block font-black"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}
            >
              {es
                ? 'Lista pública para Almas Gemelas y Top Mensual'
                : 'Public list for Soulmates and Monthly Top'}
            </span>
            <span
              className="block text-[12px] text-[var(--ink)]/60 mt-1"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {es
                ? 'Al estar activado, tus saves de "Mis Tracks" se cuentan en el Top Mensual de la Comunidad y permiten calcular tus Almas Gemelas. Si lo desactivas, tu lista detallada en /u/<id>/tracks sigue siendo accesible vía link directo, pero no apareces en cruces de afinidad ni en rankings agregados.'
                : 'When enabled, your saves count toward the community Monthly Top and feed Soulmates affinity. When disabled, your detailed list at /u/<id>/tracks is still reachable via direct link, but you’re excluded from affinity matches and aggregate rankings.'}
            </span>
          </span>
        </label>
      </div>
    </div>
  )
}
