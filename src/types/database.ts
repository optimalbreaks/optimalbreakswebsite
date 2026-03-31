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
        Insert: Pick<EventRatingRow, 'user_id' | 'event_id' | 'rating' | 'review'>
        Update: Partial<Pick<EventRatingRow, 'rating' | 'review'>>
        Relationships: DbRelationship[]
      }
      profiles: {
        Row: ProfileRow
        Insert: Omit<ProfileRow, 'created_at' | 'updated_at'>
        Update: Partial<Omit<ProfileRow, 'id' | 'created_at' | 'updated_at'>>
        Relationships: DbRelationship[]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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