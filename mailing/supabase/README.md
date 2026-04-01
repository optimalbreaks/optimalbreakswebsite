# Correos de autenticación (Supabase)

Plantillas **HTML** para pegar en el panel de Supabase: **Authentication → Email**. Estética alineada con la web (papel, tinta, rojo Optimal Breaks, franja amarilla), maquetadas con **tablas y estilos inline** para **Outlook**, Gmail, Apple Mail, etc.

## Enlace del botón: `RedirectTo` + `TokenHash` (recomendado)

En este repo, el CTA principal **no** usa solo `{{ .ConfirmationURL }}` (que pasa por `auth/v1/verify` en Supabase y a veces acaba en URLs con PKCE rotas o `next` mal formado).

En su lugar, el `href` del botón y el enlace en texto plano siguen el patrón de la [documentación de plantillas de Supabase](https://supabase.com/docs/guides/auth/auth-email-templates) para **SSR**:

- **`{{ .RedirectTo }}`** — URL absoluta que la app pasó en `emailRedirectTo` / `redirectTo` (p. ej. `https://www.optimalbreaks.com/es/auth/confirm`).
- **`{{ .TokenHash }}`** — hash del token para `verifyOtp` en tu servidor.
- **`type=…`** — según el tipo de correo (`signup`, `recovery`, `invite`, `magiclink`, `email_change`, `reauthentication`).

Ejemplo (recuperación de contraseña):

```text
{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery
```

La aplicación expone **`GET /{lang}/auth/confirm`** (`src/app/[lang]/auth/confirm/route.ts`): llama a `verifyOtp({ token_hash, type })`, escribe la sesión en cookies y redirige. Con **`recovery`** → **`/{lang}/reset-password`** (formulario de **nueva contraseña**).

**Importante:** en el código, `emailRedirectTo` y `redirectTo` deben ser **`…/{lang}/auth/confirm`** para que `{{ .RedirectTo }}` coincida con esa ruta (véase `AuthProvider.tsx` y [README.md](../../README.md#authentication-supabase-auth-and-email-templates)).

Si dejas plantillas antiguas que solo usan `{{ .ConfirmationURL }}`, el usuario puede acabar en **`/{lang}/auth/callback`** sin `?code=`; la app intenta **reenviar** a `/auth/confirm` parseando `token_hash` incluso si viene incrustado en `next`. Lo fiable es **pegar estas plantillas** en el dashboard.

## Archivos (orden sugerido al configurar el panel)

| Archivo | Plantilla en Supabase | `type=` en el enlace |
|---------|------------------------|----------------------|
| `01-confirm-sign-up.html` | Confirm sign up | `signup` |
| `02-invite-user.html` | Invite user | `invite` |
| `03-magic-link.html` | Magic link | `magiclink` |
| `04-change-email.html` | Change email address | `email_change` |
| `05-reset-password.html` | Reset password | `recovery` |
| `06-reauthentication.html` | Reauthentication | `reauthentication` |

En el comentario al inicio de cada HTML hay un **asunto sugerido** para el campo *Subject* del mismo template.

## Cómo aplicarlas

1. Abre el `.html` en el editor; puedes quitar el bloque `<!-- ... -->` inicial si no quieres notas en Supabase.
2. Copia el documento completo (`<!DOCTYPE>` … `</html>`) y pégalo en el cuerpo del template. Si el editor solo acepta fragmento, prueba **solo el interior de `<body>…</body>`**.
3. Guarda en el dashboard. Repite para cada tipo de correo.

## Variables Go (Supabase)

- **`{{ .RedirectTo }}`** — URL de redirección que envió la app (debe ser tu `/{lang}/auth/confirm` en flujos nuevos).
- **`{{ .TokenHash }}`** — para construir el enlace a `/auth/confirm` como arriba.
- **`{{ .ConfirmationURL }}`** — enlace clásico vía Supabase (no es el patrón principal en estos HTML).
- **`{{ .Token }}`** — OTP de 6 dígitos (útil si Safe Links u otro sistema “consume” el enlace al previsualizar).
- **`{{ .SiteURL }}`**, **`{{ .Email }}`**, **`{{ .Data }}`**, etc. — [documentación oficial](https://supabase.com/docs/guides/auth/auth-email-templates).
- **Change email:** `{{ .NewEmail }}` y `{{ .Email }}` (correo anterior).

En `06-reauthentication.html`, el bloque opcional del botón sigue condicionado con `{{ if .ConfirmationURL }}` por compatibilidad; los enlaces internos usan `RedirectTo` + `TokenHash`. Si Supabase se queja del `if`, simplifica según indique el panel.

## Flujo en la aplicación (resumen)

| Acción | Destino en el correo (repo) | Resultado |
|--------|------------------------------|-----------|
| Alta / invitación / magic link / cambio correo | `/{lang}/auth/confirm?token_hash=…&type=…` | Sesión + redirección a `login` u otra ruta segura |
| Recuperar contraseña | Igual con `type=recovery` | Sesión de recuperación + **`/{lang}/reset-password`** |
| Google OAuth | `/{lang}/auth/callback?next=…` | `exchangeCodeForSession` con `?code=` |

**Supabase → URL Configuration:** Site URL y **Redirect URLs** deben incluir producción (`https://www.optimalbreaks.com/**`) y local (`http://localhost:3000/**` o el puerto que uses).

Los correos enviados **manualmente** desde el panel de Supabase (“Send recovery”) **no** usan el `redirectTo` de tu web; para probar el mismo flujo que los usuarios, usa **¿Olvidaste tu contraseña?** en `/login`.

## SMTP propio (OVH u otro)

Si activas **SMTP personalizado**, desactiva el **tracking de enlaces** del proveedor si reescribe URLs y rompe la verificación.

---

*English summary:* Paste these HTML templates into **Supabase → Authentication → Email**. Primary links use **`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…`** so verification hits **`/{lang}/auth/confirm`** (server `verifyOtp`); **recovery** then redirects to **`/{lang}/reset-password`**. OAuth still uses **`/{lang}/auth/callback`**. See [README.md](../../README.md#authentication-supabase-auth-and-email-templates).
