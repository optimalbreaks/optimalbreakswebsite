// ============================================
// OPTIMAL BREAKS — Database Types
// ============================================

/** Matches @supabase Supabase `GenericRelationship` so `Relationships` is not inferred as `[]`. */
type DbRelationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

/** Chart tables (sin `extends Record<…>`: evita inferencia rota en el cliente Supabase). */
export interface ChartTrackArtist {
  name: string
  beatport_url?: string
}

export type ChartEdition = {
  id: string
  created_at: string
  week_date: string
  title: string
  description_en: string
  description_es: string
  is_published: boolean
  published_at: string | null
  sources: string[]
}

/** Picks editoriales «New releases» (metadatos pegados a mano; sin scrape). */
export interface ChartFeaturedArtist {
  name: string
  url?: string
}

export type ChartFeaturedTrack = {
  id: string
  chart_edition_id: string
  sort_order: number
  title: string
  mix_name: string
  artists: ChartFeaturedArtist[]
  label: string
  platform: string
  link_url: string
  link_label: string
  artwork_url: string | null
  sample_url: string | null
  bpm: number | null
  music_key: string
  release_year: number | null
  note_en: string
  note_es: string
}

/** Columna en BD: `music_key` (antes `key`; la palabra `key` rompía los genéricos de @supabase/supabase-js). */
export type ChartTrack = {
  id: string
  chart_edition_id: string
  position: number
  title: string
  mix_name: string
  artists: ChartTrackArtist[]
  label: string
  bpm: number | null
  music_key: string
  /** Año de publicación en Beatport (lanzamiento), null si no hay dato. */
  release_year: number | null
  beatport_url: string | null
  artwork_url: string | null
  sample_url: string | null
  waveform_url: string | null
  previous_position: number | null
  weeks_in_chart: number
}

export interface Database {
  public: {
    Tables: {
      artists: {
        Row: Artist
        Insert: Omit<Artist, 'id' | 'created_at'>
        Update: Partial<Omit<Artist, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      labels: {
        Row: Label
        Insert: Omit<Label, 'id' | 'created_at'>
        Update: Partial<Omit<Label, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      organizations: {
        Row: Organization
        Insert: Omit<Organization, 'id' | 'created_at'>
        Update: Partial<Omit<Organization, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      events: {
        Row: BreakEvent
        Insert: Omit<BreakEvent, 'id' | 'created_at'>
        Update: Partial<Omit<BreakEvent, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      blog_posts: {
        Row: BlogPost
        Insert: Omit<BlogPost, 'id' | 'created_at'>
        Update: Partial<Omit<BlogPost, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      scenes: {
        Row: Scene
        Insert: Omit<Scene, 'id' | 'created_at'>
        Update: Partial<Omit<Scene, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      mixes: {
        Row: Mix
        Insert: Omit<Mix, 'id' | 'created_at'>
        Update: Partial<Omit<Mix, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      history_entries: {
        Row: HistoryEntry
        Insert: Omit<HistoryEntry, 'id' | 'created_at'>
        Update: Partial<Omit<HistoryEntry, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      favorite_artists: {
        Row: FavoriteArtistRow
        Insert: Pick<FavoriteArtistRow, 'user_id' | 'artist_id'>
        Update: Partial<Pick<FavoriteArtistRow, 'user_id' | 'artist_id'>>
        Relationships: DbRelationship[]
      }
      favorite_labels: {
        Row: FavoriteLabelRow
        Insert: Pick<FavoriteLabelRow, 'user_id' | 'label_id'>
        Update: Partial<Pick<FavoriteLabelRow, 'user_id' | 'label_id'>>
        Relationships: DbRelationship[]
      }
      saved_mixes: {
        Row: SavedMixRow
        Insert: Pick<SavedMixRow, 'user_id' | 'mix_id'>
        Update: Partial<Pick<SavedMixRow, 'user_id' | 'mix_id'>>
        Relationships: DbRelationship[]
      }
      favorite_events: {
        Row: FavoriteEventRow
        Insert: Pick<FavoriteEventRow, 'user_id' | 'event_id'>
        Update: Partial<Pick<FavoriteEventRow, 'user_id' | 'event_id'>>
        Relationships: DbRelationship[]
      }
      event_attendance: {
        Row: EventAttendanceRow
        Insert: Pick<EventAttendanceRow, 'user_id' | 'event_id' | 'status'>
        Update: Partial<Pick<EventAttendanceRow, 'status'>>
        Relationships: DbRelationship[]
      }
      artist_sightings: {
        Row: ArtistSightingRow
        Insert: Omit<ArtistSightingRow, 'id' | 'created_at'>
        Update: Partial<Omit<ArtistSightingRow, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      event_ratings: {
        Row: EventRatingRow
        Insert: Pick<
          EventRatingRow,
          'user_id' | 'event_id' | 'rating' | 'review' | 'attended_at' | 'venue' | 'city' | 'country'
        >
        Update: Partial<Pick<EventRatingRow, 'rating' | 'review' | 'attended_at' | 'venue' | 'city' | 'country'>>
        Relationships: DbRelationship[]
      }
      profiles: {
        Row: ProfileRow
        Insert: Omit<ProfileRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<ProfileRow, 'id' | 'created_at' | 'updated_at'>>
        Relationships: DbRelationship[]
      }
      breakbeat_profiles: {
        Row: BreakbeatProfileRow
        Insert: Omit<BreakbeatProfileRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<BreakbeatProfileRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
        Relationships: DbRelationship[]
      }
      chart_editions: {
        Row: ChartEdition
        Insert: Omit<ChartEdition, 'id' | 'created_at'>
        Update: Partial<Omit<ChartEdition, 'id' | 'created_at'>>
        Relationships: DbRelationship[]
      }
      chart_tracks: {
        Row: ChartTrack
        Insert: Omit<ChartTrack, 'id'>
        Update: Partial<Omit<ChartTrack, 'id'>>
        Relationships: DbRelationship[]
      }
      chart_featured_tracks: {
        Row: ChartFeaturedTrack
        Insert: Omit<ChartFeaturedTrack, 'id'>
        Update: Partial<Omit<ChartFeaturedTrack, 'id'>>
        Relationships: DbRelationship[]
      }
      mix_play_events: {
        Row: MixPlayEventRow
        Insert: Pick<MixPlayEventRow, 'mix_id'> & Partial<Pick<MixPlayEventRow, 'user_id'>>
        Update: never
        Relationships: DbRelationship[]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      event_engaged_user_count: {
        Args: { eid: string }
        Returns: number
      }
      admin_engagement_stats: {
        Args: { p_limit?: number }
        Returns: Record<string, unknown>
      }
    }
  }
}

export interface FavoriteArtistRow extends Record<string, unknown> {
  id: string
  user_id: string
  artist_id: string
  created_at: string
}

export interface FavoriteLabelRow extends Record<string, unknown> {
  id: string
  user_id: string
  label_id: string
  created_at: string
}

export interface SavedMixRow extends Record<string, unknown> {
  id: string
  user_id: string
  mix_id: string
  created_at: string
}

export interface MixPlayEventRow extends Record<string, unknown> {
  id: string
  mix_id: string
  user_id: string | null
  created_at: string
}

export interface FavoriteEventRow extends Record<string, unknown> {
  id: string
  user_id: string
  event_id: string
  created_at: string
}

export interface EventAttendanceRow extends Record<string, unknown> {
  id: string
  user_id: string
  event_id: string
  created_at: string
  status: 'wishlist' | 'attending' | 'attended'
}

export interface ArtistSightingRow extends Record<string, unknown> {
  id: string
  user_id: string
  artist_id: string
  created_at: string
  seen_at: string
  venue: string
  city: string
  country: string
  event_name: string
  notes: string
  rating: number | null
}

export interface EventRatingRow extends Record<string, unknown> {
  id: string
  user_id: string
  event_id: string
  created_at: string
  rating: number
  review: string | null
  attended_at: string | null
  venue: string
  city: string
  country: string
}

export interface ProfileRow extends Record<string, unknown> {
  id: string
  created_at: string
  updated_at: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  bio: string
  country: string
  favorite_genre: string
  total_favorites: number
  total_events_attended: number
  total_events_wishlist: number
  role: 'user' | 'admin'
}

export interface BreakbeatProfileRow extends Record<string, unknown> {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  analysis_text_en: string
  analysis_text_es: string
  archetype_en: string
  archetype_es: string
  stats: BreakbeatProfileStats
  input_hash: string
  generated_by: 'rules' | 'openai' | 'manual'
}

export interface BreakbeatProfileStats {
  top_styles: { name: string; count: number; pct: number }[]
  top_countries: { name: string; count: number; pct: number }[]
  era_distribution: Record<string, number>
  /** Pesos por año calendario (0–1). Artistas → año centro de década; sellos y mixes → año exacto. */
  year_distribution?: Record<string, number>
  category_breakdown: Record<string, number>
  event_profile: { festivals: number; club_nights: number; countries: string[] }
  mix_taste: Record<string, number>
  label_decades: Record<string, number>
  total_data_points: number
  sample_artists?: string[]
  sample_labels?: string[]
  sample_events?: string[]
  sample_mixes?: string[]
  sample_tracks?: string[]
  sample_artist_releases?: string[]
  sample_label_releases?: string[]
  sample_label_artists?: string[]
  sample_recommended_mixes?: string[]
  sample_event_lineup?: string[]
  sample_event_contexts?: string[]
  sample_mix_contexts?: string[]
  dominant_eras?: { name: string; pct: number }[]
  dominant_years?: { year: string; pct: number }[]
  scene_hints?: string[]
}

export interface ArtistKeyRelease {
  title: string
  year: number
  note?: string
}

export interface Artist extends Record<string, unknown> {
  id: string
  created_at: string
  slug: string
  name: string
  name_display: string
  real_name: string | null
  country: string
  bio_en: string
  bio_es: string
  category: 'pioneer' | 'uk_legend' | 'us_artist' | 'andalusian' | 'current' | 'crew'
  styles: string[]
  era: string
  image_url: string | null
  og_image_url: string | null
  essential_tracks: string[]
  recommended_mixes: string[]
  related_artists: string[]
  labels_founded: string[]
  key_releases: ArtistKeyRelease[]
  website: string | null
  socials: Record<string, string>
  is_featured: boolean
  sort_order: number
}

export interface Label extends Record<string, unknown> {
  id: string
  created_at: string
  slug: string
  name: string
  country: string
  founded_year: number | null
  description_en: string
  description_es: string
  image_url: string | null
  og_image_url: string | null
  website: string | null
  key_artists: string[]
  key_releases: string[]
  is_active: boolean
  is_featured: boolean
  organization_id: string | null
}

export type OrganizationRole = 'label' | 'promoter' | 'booking' | 'media' | 'community'

export interface Organization extends Record<string, unknown> {
  id: string
  created_at: string
  slug: string
  name: string
  country: string
  base_city: string | null
  founded_year: number | null
  description_en: string
  description_es: string
  image_url: string | null
  website: string | null
  socials: Record<string, string>
  roles: OrganizationRole[]
  is_active: boolean
  is_featured: boolean
}

export interface EventStage {
  name: string
  description_en?: string
  description_es?: string
  lineup?: string[]
}

export interface EventScheduleSlot {
  time: string
  artist: string
  stage?: string
  duration_min?: number
  is_b2b?: boolean
  note?: string
}

export interface BreakEvent extends Record<string, unknown> {
  id: string
  created_at: string
  slug: string
  name: string
  description_en: string
  description_es: string
  event_type: 'festival' | 'club_night' | 'past_iconic' | 'upcoming'
  date_start: string | null
  date_end: string | null
  location: string
  city: string
  country: string
  venue: string | null
  image_url: string | null
  og_image_url: string | null
  website: string | null
  lineup: string[]
  is_featured: boolean
  promoter_organization_id: string | null
  stages: EventStage[]
  schedule: EventScheduleSlot[]
  tickets_url: string | null
  socials: Record<string, string>
  capacity: number | null
  age_restriction: string | null
  tags: string[]
  doors_open: string | null
  doors_close: string | null
  address: string | null
  coords: { lat: number; lng: number } | null
}

export interface BlogPost extends Record<string, unknown> {
  id: string
  created_at: string
  slug: string
  title_en: string
  title_es: string
  excerpt_en: string
  excerpt_es: string
  content_en: string
  content_es: string
  category: 'article' | 'ranking' | 'retrospective' | 'interview' | 'review' | 'opinion'
  tags: string[]
  image_url: string | null
  og_image_url: string | null
  author: string
  published_at: string
  is_published: boolean
  is_featured: boolean
}

export interface Scene extends Record<string, unknown> {
  id: string
  created_at: string
  slug: string
  name_en: string
  name_es: string
  country: string
  region: string | null
  description_en: string
  description_es: string
  key_artists: string[]
  key_labels: string[]
  key_venues: string[]
  era: string
  image_url: string | null
  og_image_url: string | null
  is_featured: boolean
}

export interface Mix extends Record<string, unknown> {
  id: string
  created_at: string
  slug: string
  title: string
  artist_name: string
  artist_id: string | null
  description_en: string
  description_es: string
  mix_type: 'essential_mix' | 'classic_set' | 'radio_show' | 'youtube_session' | 'podcast'
  year: number | null
  duration_minutes: number | null
  embed_url: string | null
  video_url: string | null
  platform: 'soundcloud' | 'youtube' | 'mixcloud' | 'other'
  image_url: string | null
  is_featured: boolean
  /** Fecha de publicación en la plataforma (p. ej. YouTube); ordenación principal en /mixes */
  published_at?: string | null
  /** URL directa a un archivo de audio (MP3) para reproducción nativa */
  audio_url?: string | null
}

export interface HistoryEntry extends Record<string, unknown> {
  id: string
  created_at: string
  slug: string
  title_en: string
  title_es: string
  content_en: string
  content_es: string
  section: 'origins' | 'uk_breakbeat' | 'us_breaks' | 'andalusian' | 'australian' | 'rise_decline_revival' | 'digital_era'
  year_start: number
  year_end: number | null
  image_url: string | null
  sort_order: number
}