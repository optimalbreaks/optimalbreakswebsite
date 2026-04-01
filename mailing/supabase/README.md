# Correos de autenticación (Supabase)

Plantillas **HTML** para pegar en el panel de Supabase: **Authentication → Email** (plantillas de correo). Estética alineada con la web (papel, tinta, rojo Optimal Breaks, franja amarilla), maquetadas con **tablas y estilos inline** para que se lean bien en **Outlook**, Gmail, Apple Mail, etc.

**No sustituyen la configuración de redirección:** el destino tras hacer clic lo define la URL que genera Supabase en `{{ .ConfirmationURL }}` (incluye el `redirect_to` que manda la app: registro → `/{lang}/auth/callback`, recuperación → `/{lang}/auth/callback?next=…`). Las plantillas solo cambian **texto y diseño**; el botón principal debe seguir usando `href="{{ .ConfirmationURL }}"`.

## Archivos (orden sugerido al configurar el panel)

| Archivo | Plantilla en Supabase |
|---------|------------------------|
| `01-confirm-sign-up.html` | Confirm sign up |
| `02-invite-user.html` | Invite user |
| `03-magic-link.html` | Magic link |
| `04-change-email.html` | Change email address |
| `05-reset-password.html` | Reset password |
| `06-reauthentication.html` | Reauthentication |

En el comentario al inicio de cada HTML hay un **asunto sugerido** para el campo *Subject* del mismo template.

## Cómo aplicarlas

1. Abre el `.html` en el editor, elimina el bloque `<!-- ... -->` inicial si no quieres guardar notas en Supabase.
2. Copia el documento completo (`<!DOCTYPE>` … `</html>`) y pégalo en el cuerpo del template. Si el editor solo acepta fragmento, prueba con **solo el contenido dentro de `<body>…</body>`**.
3. Guarda en el dashboard. Repite para cada tipo de correo.

## Variables Go (Supabase)

- `{{ .ConfirmationURL }}` — enlace de verificación (lleva el `redirect_to` acordado con la app).
- `{{ .Token }}` — OTP de 6 dígitos (útil si Microsoft Safe Links u otro sistema “consume” el enlace al previsualizar).
- `{{ .SiteURL }}`, `{{ .Email }}`, `{{ .RedirectTo }}`, `{{ .Data }}` según [documentación oficial](https://supabase.com/docs/guides/auth/auth-email-templates).
- **Change email:** `{{ .NewEmail }}` y `{{ .Email }}` (correo anterior).

En `06-reauthentication.html`, el botón y el enlace duplicado van dentro de `{{ if .ConfirmationURL }}` por si en algún proyecto no hay URL; si al guardar Supabase se queja del `if`, quita ese bloque y deja solo el código `{{ .Token }}`.

## Flujo en la aplicación (recordatorio)

- **Alta:** `AuthProvider` → `signUp` con `emailRedirectTo` → `https://tudominio/{lang}/auth/callback` (tras el `code`, redirige a `/{lang}/login`).
- **Recuperación:** `resetPasswordForEmail` con `redirectTo` → `/{lang}/auth/callback?next=/{lang}/reset-password`.
- **OAuth (Google):** mismo prefijo `/{lang}/auth/callback?next=…`. La ruta antigua `/api/auth/callback` sigue existiendo por compatibilidad.
- **Supabase → URL Configuration:** Site URL y **Redirect URLs** deben incluir el origen de producción (p. ej. `https://www.optimalbreaks.com/**`) y, para pruebas locales, `http://localhost:3000/**` o el puerto que uses.

Los correos enviados **desde el panel de Supabase** (p. ej. “Send recovery” manual) **no** usan el `redirectTo` de la app; para el mismo flujo que en producción, conviene la opción **¿Olvidaste tu contraseña?** en la web.

## SMTP propio (OVH u otro)

Si activas **SMTP personalizado** en Supabase, desactiva el **tracking de enlaces** del proveedor de correo si lo hubiera: puede reescribir URLs y romper `{{ .ConfirmationURL }}`.

---

*English summary:* HTML email templates for Supabase Auth (confirm signup, invite, magic link, email change, reset password, reauthentication). Paste into **Authentication → Email templates**. Redirect targets are set by the app (`emailRedirectTo` / `redirectTo` → `/{lang}/auth/callback`); templates only control look and copy. See also the main [README.md](../../README.md).
