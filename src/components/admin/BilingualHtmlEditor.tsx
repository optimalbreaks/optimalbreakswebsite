'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState, type ComponentProps, type ComponentType } from 'react'
import type { Editor as TinyMCEEditorType } from '@tinymce/tinymce-react'
import BilingualTextarea from './BilingualTextarea'

const TinyEditor = dynamic(
  () =>
    import('@tinymce/tinymce-react').then((mod) => {
      const { Editor } = mod
      function LoadedEditor(props: ComponentProps<typeof Editor>) {
        return <Editor {...props} />
      }
      return LoadedEditor
    }),
  {
    ssr: false,
    loading: () => (
      <div className="px-3 py-10 text-center admin-muted normal-case" style={{ fontFamily: "'Courier Prime', monospace" }}>
        Cargando editor…
      </div>
    ),
  },
) as ComponentType<ComponentProps<typeof TinyMCEEditorType>>

interface BilingualHtmlEditorProps {
  valueEn: string
  valueEs: string
  onChangeEn: (val: string) => void
  onChangeEs: (val: string) => void
  label?: string
  /** Clave estable por post (p. ej. id de fila o slug) para remontar el editor al cargar datos */
  instanceKey?: string
}

function useTinyApiKey(): string | undefined {
  return useMemo(() => process.env.NEXT_PUBLIC_TINYMCE_API_KEY?.trim() || undefined, [])
}

function tinymceInit() {
  const paper = '#e8dcc8'
  const ink = '#1a1a1a'
  return {
    height: 480,
    menubar: false,
    branding: false,
    promotion: false,
    plugins: 'lists link image code autolink',
    toolbar:
      'undo redo | blocks | bold italic underline | bullist numlist | link image | hr blockquote | removeformat | code',
    block_formats: 'Paragraph=p; Heading 2=h2; Heading 3=h3; Heading 4=h4',
    invalid_elements: 'script,iframe,object,embed,form,input,button,textarea,select,style',
    relative_urls: false,
    remove_script_host: false,
    convert_urls: true,
    link_default_target: '_blank',
    link_rel_list: [
      { title: 'noopener noreferrer', value: 'noopener noreferrer' },
      { title: 'nofollow noopener noreferrer', value: 'nofollow noopener noreferrer' },
    ],
    image_caption: false,
    image_title: true,
    content_style: `
      body {
        font-family: "Special Elite", "Courier New", monospace;
        font-size: 16px;
        line-height: 1.75;
        color: ${ink};
        background: ${paper};
        max-width: 720px;
        margin: 12px auto;
        padding: 0 8px;
      }
      h2 {
        font-family: "Unbounded", system-ui, sans-serif;
        font-weight: 900;
        font-size: clamp(22px, 4vw, 32px);
        line-height: 1.12;
        text-transform: uppercase;
        letter-spacing: -0.02em;
        margin: 1.25em 0 0.5em 0;
        padding-bottom: 0.35em;
        border-bottom: 3px solid ${ink};
      }
      h3 {
        font-family: "Unbounded", system-ui, sans-serif;
        font-weight: 900;
        font-size: clamp(17px, 3vw, 24px);
        line-height: 1.15;
        text-transform: uppercase;
        margin: 1em 0 0.45em 0;
        padding-left: 0.5em;
        border-left: 5px solid #d62828;
      }
      h4 {
        font-family: "Unbounded", system-ui, sans-serif;
        font-weight: 800;
        font-size: 1rem;
        text-transform: uppercase;
        margin: 0.85em 0 0.35em 0;
      }
      a { color: #d62828; }
      blockquote { border-left: 4px solid #d62828; margin: 1em 0; padding-left: 1em; color: #555; }
      img { max-width: 100%; height: auto; border: 2px solid ${ink}; }
    `,
  }
}

export default function BilingualHtmlEditor({
  valueEn,
  valueEs,
  onChangeEn,
  onChangeEs,
  label,
  instanceKey = 'new',
}: BilingualHtmlEditorProps) {
  const apiKey = useTinyApiKey()
  const [tab, setTab] = useState<'en' | 'es'>('es')
  const init = useMemo(() => tinymceInit(), [])

  if (!apiKey) {
    return (
      <BilingualTextarea
        label={label}
        rows={16}
        valueEn={valueEn}
        valueEs={valueEs}
        onChangeEn={onChangeEn}
        onChangeEs={onChangeEs}
      />
    )
  }

  const current = tab === 'en' ? valueEn : valueEs
  const setCurrent = tab === 'en' ? onChangeEn : onChangeEs

  return (
    <div className="space-y-2">
      {label ? <label className="admin-label">{label}</label> : null}
      <div className="border-[3px] border-[var(--ink)] bg-[#fffef6] shadow-[4px_4px_0_rgba(26,26,26,0.12)] admin-tinymce-host">
        <div className="flex border-b-[3px] border-[var(--ink)]">
          {(['es', 'en'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-r-[3px] border-[var(--ink)] last:border-r-0 ${
                tab === t
                  ? 'bg-[var(--red)] text-white'
                  : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
              }`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="p-1 sm:p-2 bg-[var(--paper)]">
          <TinyEditor
            key={`${instanceKey}-${tab}`}
            apiKey={apiKey}
            value={current}
            onEditorChange={(html) => setCurrent(html)}
            init={init}
          />
        </div>
      </div>
      <p className="admin-muted text-[11px] normal-case leading-snug" style={{ fontFamily: "'Courier Prime', monospace" }}>
        HTML compatible con el blog: párrafos, h2–h4, negrita, listas, enlaces, imágenes por URL, comillas y línea
        horizontal. El sitio público aplica los estilos Optimal Breaks y filtra el resto al guardar.
      </p>
    </div>
  )
}
