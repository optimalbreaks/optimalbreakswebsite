-- ============================================
-- Admin editorial chat — threads + messages
-- ============================================

CREATE TABLE IF NOT EXISTS public.admin_chat_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  title TEXT,
  intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_chat_threads_user_updated_idx
  ON public.admin_chat_threads (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.admin_chat_threads (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  pending_ops JSONB,
  tool_trace JSONB,
  attached_urls TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_chat_messages_thread_created_idx
  ON public.admin_chat_messages (thread_id, created_at ASC);

ALTER TABLE public.admin_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_chat_messages ENABLE ROW LEVEL SECURITY;

-- Solo service role / backend admin escribe; denegar políticas públicas por defecto.
-- (El chat usa createServiceSupabase en API.)
