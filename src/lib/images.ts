/*
  Every image on the site goes through this one map. The files in
  public/images are generated placeholders (fictional people, rendered
  shapes). Swap in your own photography by replacing a file with the same
  name, or by pointing a key at a new URL.

  Keys map to files in public/images; the editorial system uses photography
  only, so the old decorative shape renders are gone.
*/
export const IMAGES = {
  'cam-student-1': '/images/cam-student-1.webp',
  'cam-student-2': '/images/cam-student-2.webp',
  'prog-data': '/images/prog-data.webp',
  'prog-design': '/images/prog-design.webp',
  'prog-business': '/images/prog-business.webp',
  'prog-health': '/images/prog-health.webp',
  'prog-computing': '/images/prog-computing.webp',
  'prog-psych': '/images/prog-psych.webp',
  'prog-a320': '/images/prog-a320.webp',
  'prog-human-factors': '/images/prog-human-factors.webp',
  'campus-hub': '/images/campus-hub.webp',
  'faculty-1': '/images/faculty-1.webp',
  'faculty-2': '/images/faculty-2.webp',
  'faculty-3': '/images/faculty-3.webp',
} as const

export type ImageKey = keyof typeof IMAGES

export const img = (key: ImageKey) => IMAGES[key]
