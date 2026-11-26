/*
  Student accounts, read from D1.

  The portal never trusts a client-supplied student id: the signed session names
  the account and every read is scoped by it. `student_no` is the number a
  student types at sign-in; `id` is the internal key the enrolment and submission
  tables already use, and it stays out of URLs and forms.
*/
import type { StudentIdentityDTO } from '../contracts/learning'
import { queryOne, type Db } from './sql'

type StudentRow = {
  id: string
  student_no: string | null
  name: string
  email: string
  cohort: string
}

const SELECT_STUDENT = `SELECT id, student_no, name, email, cohort FROM students`

const identity = (row: StudentRow): StudentIdentityDTO => ({
  id: row.id,
  studentNo: row.student_no ?? '',
  name: row.name,
  email: row.email,
  cohort: row.cohort,
})

export async function studentById(db: Db, studentId: string): Promise<StudentIdentityDTO | null> {
  const row = await queryOne<StudentRow>(db, `${SELECT_STUDENT} WHERE id = ?1`, studentId)
  return row ? identity(row) : null
}

/**
 * Email and student number, both case-insensitive, in one lookup. One query for
 * both halves of the credential means a wrong email and a wrong number cost the
 * same work and answer the same way.
 */
export async function studentForSignIn(db: Db, email: string, studentNo: string): Promise<StudentIdentityDTO | null> {
  const row = await queryOne<StudentRow>(
    db,
    `${SELECT_STUDENT} WHERE lower(email) = lower(?1) AND lower(student_no) = lower(?2)`,
    email,
    studentNo,
  )
  return row ? identity(row) : null
}
