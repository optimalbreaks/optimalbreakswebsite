// ============================================
// OPTIMAL BREAKS — Database Types
// ============================================

export interface Database {
  public: {
    Tables: {
      artists: {
        Row: Artist
        Insert: Omit<Artist, 'id' | 'created_at'>
        Update: Partial<Omit<Artist, 'id' | 'created_at'>>
      }
      labels: {
        Row: Label
        Insert: Omit<Label, 'id' | 'created_at'>
        Update: Partial<Omit<Label, 'id' | 'created_at'>>
      }
      events: {
        Row: BreakEvent
        Insert: Omit<BreakEvent, 'id' | 'created_at'>
        Update: Partial<Omit<BreakEvent, 'id' | 'created_at'>>
      }
      blog_posts: {
        Row: BlogPost
        Insert: Omit<BlogPost, 'id' | 'created_at'>
        Update: Partial<Omit<BlogPost, 'id' | 'created_at'>>
      }
      scenes: {
        Row: Scene
        Insert: Omit<Scene, 'id' | 'created_at'>
        Update: Partial<Omit<Scene, 'id' | 'created_at'>>
      }
      mixes: {
        Row: Mix
        Insert: Omit<Mix, 'id' | 'created_at'>
        Update: Partial<Omit<Mix, 'id' | 'created_at'>>
      }
      history_entries: {
        Row: HistoryEntry
        Insert: Omit<HistoryEntry, 'id' | 'created_at'>
        Update: Partial<Omit<HistoryEntry, 'id' | 'created_at'>>
      }
    }
  }
}

export interface Artist {
  id: string
  created_at: string
  slug: string
  name: string
  name_display: string
  country: string
  bio_en: string
  bio_es: string
  category: 'pioneer' | 'uk_legend' | 'us_artist' | 'andalusian' | 'current' | 'crew'
  styles: string[]
  era: string
  image_url: string | null
  essential_tracks: string[]
  recommended_mixes: string[]
  related_artists: string[]
  website: string | null
  socials: Record<string, string>
  is_featured: boolean
  sort_order: number
}

export interface Label {
  id: string
  created_at: string
  slug: string
  name: string
  country: string
  founded_year: number | null
  description_en: string
  description_es: string
  image_url: string | null
  website: string | null
  key_artists: string[]
  key_releases: string[]
  is_active: boolean
  is_featured: boolean
}

export interface BreakEvent {
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
  website: string | null
  lineup: string[]
  is_featured: boolean
}

export interface BlogPost {
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
  author: string
  published_at: string
  is_published: boolean
  is_featured: boolean
}

export interface Scene {
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
  is_featured: boolean
}

export interface Mix {
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
  platform: 'soundcloud' | 'youtube' | 'mixcloud' | 'other'
  image_url: string | null
  is_featured: boolean
}

export interface HistoryEntry {
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