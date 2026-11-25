/*
  Media contracts: assets, upload sessions, processing state, playback grants.

  FADEC decision: uploads are direct-to-storage against a short-lived signed
  session; bytes never pass through the app server (master PRD §5.8). The
  demo may simulate steps 2–5, but the four states are real and are what the
  UI binds to.
*/
import type { AuditStamp, Id, IsoDateTime } from './common'

export type MediaKind = 'VIDEO' | 'PDF' | 'IMAGE'

/**
 * UPLOADING → PROCESSING → READY, or FAILED with a retry affordance.
 * FAILED is terminal for that attempt only: a retry creates a new asset.
 */
export type MediaStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED'

export type MediaAssetDTO = AuditStamp & {
  id: Id
  kind: MediaKind
  status: MediaStatus
  mimeType: string
  sizeBytes: number
  /** VIDEO only. */
  durationSeconds: number | null
  /** Safe, user-facing reason when status is FAILED. */
  failureReason: string | null
  /** True while a retry is allowed; false after the final attempt. */
  retryable: boolean
  originalFilename: string
  uploadedByUserId: Id
}

/** A downloadable attachment on a lesson. */
export type ResourceDTO = {
  id: Id
  lessonId: Id
  title: string
  kind: 'PDF' | 'SLIDES' | 'DATASET' | 'LINK' | 'OTHER'
  mediaAssetId: Id | null
  /** External URL for kind LINK; null for hosted files. */
  externalUrl: string | null
  sizeBytes: number | null
  downloadable: boolean
}

/** What the client needs to perform a direct upload. */
export type UploadSessionDTO = {
  asset: MediaAssetDTO
  uploadUrl: string
  method: 'PUT' | 'POST'
  headers: Record<string, string>
  /** Multipart form fields, when the storage provider requires them. */
  fields: Record<string, string> | null
  expiresAt: IsoDateTime
}

/**
 * Short-lived authorisation to play a video. Only issued after the server
 * checks enrolment and lesson access (master PRD §5.8 step 7).
 */
export type PlaybackGrantDTO = {
  lessonId: Id
  assetId: Id
  url: string
  format: 'HLS' | 'MP4'
  expiresAt: IsoDateTime
}
