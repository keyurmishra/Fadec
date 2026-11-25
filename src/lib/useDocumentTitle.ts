import { useEffect } from 'react'

import { SITE } from '../content'

export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${SITE.name}` : `${SITE.name} — ${SITE.tagline}`
  }, [title])
}
