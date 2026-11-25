/*
  FADEC contracts — the typed shapes the UI builds against, before any real
  API exists (frontend PRD §0: contracts first, then screens).

  Domains: identity and invite-only teachers, the course catalogue, media,
  enrolments and progress, and assessment.

  These are transport shapes, not database rows and not UI state. Server
  ownership rules that the types cannot express still apply:
  - only PUBLISHED + PUBLIC courses reach an anonymous visitor;
  - locked lessons never carry playback grants;
  - completion and scores are server-computed;
  - authorisation is re-checked per request, never inferred from a route.
*/

export * from './common'
export * from './auth'
export * from './catalog'
export * from './media'
export * from './learning'
export * from './assessment'
export * from './teaching'
