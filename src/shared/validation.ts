/*
  Shared by the browser (instant feedback) and the Worker (the real check),
  so both always agree on what a valid submission is.
*/
import { PROGRAMMES, EVENTS } from '../content'

export type FieldErrors = Record<string, string>

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function validateEmailOnly(b: Record<string, unknown>): FieldErrors {
  return EMAIL.test(str(b.email)) ? {} : { email: 'Enter a valid email address.' }
}

export function validateSignIn(b: Record<string, unknown>): FieldErrors {
  const e: FieldErrors = {}
  if (!EMAIL.test(str(b.email))) e.email = 'Enter a valid email address.'
  if (!/^[A-Z]{2,3}-\d{2}-\d{5}$/i.test(str(b.studentId))) e.studentId = 'Student IDs look like CPL-24-01873.'
  return e
}

/**
 * Teacher studio sign-in. Teacher IDs are issued by the operator, never chosen
 * by the teacher, so the shape is fixed: TCH-YYYY-NNN.
 */
export function validateTeacherSignIn(b: Record<string, unknown>): FieldErrors {
  const e: FieldErrors = {}
  if (!EMAIL.test(str(b.email))) e.email = 'Enter your work email address.'
  if (!/^TCH-\d{4}-\d{3}$/i.test(str(b.teacherId))) e.teacherId = 'Teacher IDs look like TCH-2011-004.'
  return e
}

export function validateRsvp(b: Record<string, unknown>): FieldErrors {
  const e: FieldErrors = {}
  const ev = EVENTS.find((x) => x.id === str(b.event))
  if (!ev) e.event = 'Choose an event.'
  else if (ev.taken >= ev.seats) e.event = 'This event is full.'
  if (str(b.name).length < 2) e.name = 'Enter your name.'
  if (!EMAIL.test(str(b.email))) e.email = 'Enter a valid email address.'
  return e
}

/* ----- Application, split by step so the form can check one step at a time ----- */

export type ApplicationDraft = {
  programme: string
  cohort: string
  firstName: string
  lastName: string
  email: string
  phone: string
  country: string
  dob: string
  /** Medical certificate held: the gate for every licence course. */
  medicalClass: string
  /** Licence already held, if any. */
  licenceHeld: string
  /** Total hours in the applicant's logbook, as typed. */
  loggedHours: string
  experience: string
  statement: string
  funding: string
  consent: boolean
}

export const EMPTY_DRAFT: ApplicationDraft = {
  programme: '',
  cohort: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  country: '',
  dob: '',
  medicalClass: '',
  licenceHeld: '',
  loggedHours: '',
  experience: '',
  statement: '',
  funding: 'self',
  consent: false,
}

export const STATEMENT_MIN = 150
export const STATEMENT_MAX = 2500

export function validateStep(step: number, d: Partial<ApplicationDraft>): FieldErrors {
  const e: FieldErrors = {}
  if (step === 0) {
    const p = PROGRAMMES.find((x) => x.slug === d.programme)
    if (!p) e.programme = 'Choose a course.'
    else {
      const c = p.cohorts.find((x) => x.id === d.cohort)
      if (!c) e.cohort = 'Choose an intake.'
      else if (c.taken >= c.seats) e.cohort = 'That intake is full. Choose another or join the waitlist.'
    }
  }
  if (step === 1) {
    if (str(d.firstName).length < 1) e.firstName = 'Enter your first name.'
    if (str(d.lastName).length < 1) e.lastName = 'Enter your last name.'
    if (!EMAIL.test(str(d.email))) e.email = 'Enter a valid email address.'
    if (str(d.phone) && !/^[+\d][\d\s()-]{6,}$/.test(str(d.phone))) e.phone = 'Enter a phone number with digits only.'
    if (!str(d.country)) e.country = 'Choose your country of residence.'
    const dob = Date.parse(str(d.dob))
    if (!str(d.dob) || Number.isNaN(dob)) e.dob = 'Enter your date of birth.'
    else {
      const age = (Date.parse('2026-11-12') - dob) / (365.25 * 864e5)
      if (age < 17) e.dob = 'Applicants must be 17 or older at the start date.'
      else if (age > 100) e.dob = 'Check the year of your date of birth.'
    }
  }
  if (step === 2) {
    if (!MEDICAL_CLASSES.includes(str(d.medicalClass))) e.medicalClass = 'Choose your medical certificate, or “None yet”.'
    if (!LICENCES.includes(str(d.licenceHeld))) e.licenceHeld = 'Choose the licence you hold, or “None yet”.'
    const hours = str(d.loggedHours)
    if (!hours) e.loggedHours = 'Enter your total logged hours, or 0.'
    else if (!/^\d{1,5}$/.test(hours)) e.loggedHours = 'Enter whole hours only, for example 45.'
    else if (Number(hours) > 20000) e.loggedHours = 'Check the total: that is more than 20,000 hours.'
  }
  if (step === 3) {
    const len = str(d.statement).length
    if (len < STATEMENT_MIN) e.statement = `Write at least ${STATEMENT_MIN} characters (${len} so far).`
    else if (len > STATEMENT_MAX) e.statement = `Keep it under ${STATEMENT_MAX} characters.`
    if (!['self', 'employer', 'loan', 'scholarship'].includes(str(d.funding))) e.funding = 'Choose how you plan to fund your training.'
  }
  if (step === 4) {
    if (d.consent !== true) e.consent = 'Confirm the details are accurate to submit.'
  }
  return e
}

export function validateApplication(d: Record<string, unknown>): FieldErrors {
  return Object.assign({}, ...[0, 1, 2, 3, 4].map((s) => validateStep(s, d as Partial<ApplicationDraft>)))
}

export const COUNTRIES = ['United Kingdom', 'Ireland', 'United States', 'Canada', 'Germany', 'France', 'Spain', 'Portugal', 'Netherlands', 'Nigeria', 'Kenya', 'South Africa', 'India', 'Singapore', 'Australia', 'Brazil', 'Mexico', 'Other']

/** Medical certificates a course can require. */
export const MEDICAL_CLASSES = ['Class 1', 'Class 2', 'None yet']

/** Licence level already held, if any. */
export const LICENCES = ['None yet', 'PPL', 'CPL', 'ATPL', 'Other']

export const FUNDING = [
  { id: 'self', label: 'Self-funded' },
  { id: 'employer', label: 'Employer sponsored' },
  { id: 'loan', label: 'Bank loan or cadet scheme' },
  { id: 'scholarship', label: 'Applying for a bursary' },
]
