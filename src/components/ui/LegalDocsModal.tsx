import { useMemo } from 'react'

type LegalDocId = 'terms' | 'privacy' | 'acceptable'

type Props = {
  isOpen: boolean
  initialDoc?: LegalDocId
  onClose: () => void
  onSelectDoc?: (doc: LegalDocId) => void
}

const LEGAL_CONTENT: Record<LegalDocId, { title: string; sections: Array<{ heading: string; body: string }> }> = {
  terms: {
    title: 'Terms of Use',
    sections: [
      {
        heading: 'Service Scope',
        body:
          'MyGarage provides design, visualization, and export tooling for vehicle wrap concepts. It does not grant rights to use third-party trademarks, logos, model names, or copyrighted assets.',
      },
      {
        heading: 'User Responsibility',
        body:
          'You are solely responsible for ensuring you have all permissions and licenses for any uploaded or exported content, including commercial print and installation use.',
      },
      {
        heading: 'No Legal Advice',
        body:
          'MyGarage is not legal counsel. If you are using work commercially, obtain proper legal guidance and written permissions from rights holders.',
      },
    ],
  },
  privacy: {
    title: 'Privacy Notice',
    sections: [
      {
        heading: 'What We Store',
        body:
          'Project data, profile metadata, and uploaded design assets may be stored locally and/or in configured cloud services such as Supabase to support save, sync, and restore flows.',
      },
      {
        heading: 'Authentication Data',
        body:
          'Authentication is handled by Supabase when configured. Session and basic profile display data may be cached in browser storage for user experience continuity.',
      },
      {
        heading: 'Data Control',
        body:
          'You can remove projects and profile content from the app. For hosted deployments, administrators should provide a contact path for deletion and privacy requests.',
      },
    ],
  },
  acceptable: {
    title: 'Acceptable Use',
    sections: [
      {
        heading: 'Prohibited Content',
        body:
          'Do not upload or distribute content that infringes copyrights, trademarks, or other intellectual property rights, or content that violates applicable laws.',
      },
      {
        heading: 'Commercial Printing',
        body:
          'Before printing, installing, or selling wraps, verify that all artwork, logos, and vehicle marks are legally cleared for your intended use and territory.',
      },
      {
        heading: 'Account and Security',
        body:
          'Do not attempt unauthorized access, abuse platform resources, or use automated activity that disrupts service performance for other users.',
      },
    ],
  },
}

const DOC_ORDER: LegalDocId[] = ['terms', 'privacy', 'acceptable']

function toLabel(id: LegalDocId) {
  if (id === 'terms') return 'Terms'
  if (id === 'privacy') return 'Privacy'
  return 'Acceptable Use'
}

export function LegalDocsModal({ isOpen, initialDoc = 'terms', onClose, onSelectDoc }: Props) {
  const activeDoc = initialDoc
  const doc = useMemo(() => LEGAL_CONTENT[activeDoc], [activeDoc])

  if (!isOpen) return null

  return (
    <div className="legal-modal-backdrop" role="dialog" aria-modal="true" aria-label="Legal documents" onClick={onClose}>
      <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="legal-modal-header">
          <div className="legal-modal-tabs">
            {DOC_ORDER.map((id) => (
              <button
                key={id}
                type="button"
                className={id === activeDoc ? 'legal-modal-tab active' : 'legal-modal-tab'}
                onClick={() => onSelectDoc?.(id)}
              >
                {toLabel(id)}
              </button>
            ))}
          </div>
          <button type="button" className="legal-modal-close" onClick={onClose} aria-label="Close legal dialog">
            x
          </button>
        </div>

        <h3 className="legal-modal-title">{doc.title}</h3>
        <div className="legal-modal-body">
          {doc.sections.map((section) => (
            <section key={section.heading} className="legal-modal-section">
              <h4>{section.heading}</h4>
              <p>{section.body}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
