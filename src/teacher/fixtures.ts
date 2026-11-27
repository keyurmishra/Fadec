/*
  The teacher accounts the studio signs in against.

  Teachers are still seed rows (see seeds.ts): there is no invite or onboarding
  flow yet, and sign-in is demo-only (email plus teacher ID, no password). This
  list is the one piece of teaching data still read from code rather than D1;
  moving it to the teachers table belongs with real authentication.

  The overview's sample roster, live classes and activity feed that used to sit
  here are gone: the overview now reads D1 only (see dashboard.ts).
*/
import type { TeacherIdentityDTO } from '../contracts/teaching'
import { SEED_TEACHERS } from './seeds'

export const TEACHERS: TeacherIdentityDTO[] = SEED_TEACHERS
