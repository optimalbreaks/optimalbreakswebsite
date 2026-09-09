-- Registro de envíos transaccionales (molde Furgocasa booking_email_dispatches).
-- Cada intento (OK, fallo SMTP, saltado) deja fila. No hay cuerpo del mail.
CREATE TABLE IF NOT EXISTS public.mail_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind TEXT NOT NULL CHECK (kind IN ('claim_approved', 'booking_new')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  to_email TEXT NOT NULL,
  cc_email TEXT,
  subject TEXT NOT NULL DEFAULT '',
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  claim_id UUID REFERENCES public.artist_claims(id) ON DELETE SET NULL,
  booking_request_id UUID REFERENCES public.booking_requests(id) ON DELETE SET NULL,
  smtp_message_id TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS mail_dispatches_sent_idx
  ON public.mail_dispatches (sent_at DESC);

CREATE INDEX IF NOT EXISTS mail_dispatches_kind_sent_idx
  ON public.mail_dispatches (kind, sent_at DESC);

CREATE INDEX IF NOT EXISTS mail_dispatches_to_idx
  ON public.mail_dispatches (to_email);

CREATE INDEX IF NOT EXISTS mail_dispatches_failed_idx
  ON public.mail_dispatches (sent_at DESC)
  WHERE status IN ('failed', 'skipped');

-- Un booking solo registra un «sent» por tipo; failed/skipped se pueden reintentar.
CREATE UNIQUE INDEX IF NOT EXISTS mail_dispatches_booking_sent_uniq
  ON public.mail_dispatches (kind, booking_request_id)
  WHERE status = 'sent' AND booking_request_id IS NOT NULL;

COMMENT ON TABLE public.mail_dispatches IS
  'Historial de mails transaccionales (ficha verificada, aviso de booking). sent / failed / skipped + Message-ID SMTP.';

DROP TRIGGER IF EXISTS mail_dispatches_updated_at ON public.mail_dispatches;
CREATE TRIGGER mail_dispatches_updated_at
  BEFORE UPDATE ON public.mail_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.mail_dispatches ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.mail_dispatches FROM anon, authenticated;
GRANT ALL ON TABLE public.mail_dispatches TO service_role;
