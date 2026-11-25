/*
  Every string, price, date and seed record on the site lives in this file.
  Edit here first. Images are referenced by key; the keys map to files in
  src/lib/images.ts.

  FADEC is a pilot-training academy: ground school, simulator and flight
  training for private, commercial and airline pilots.
  Routes keep the template's paths (/programmes, /admissions, /dashboard).
*/
import type { ImageKey } from './lib/images'

export const SITE = {
  name: 'FADEC',
  short: 'FADEC',
  tagline: 'Pilot training academy',
  email: 'admissions@fadec.example',
  phone: '+44 20 7946 1187',
  address: 'Registered office: Hangar 4, Kestrel Works, Bristol BS3 2QG',
  currency: '$',
}

export const NAV = [
  { label: 'Courses', to: '/programmes' },
  { label: 'Admissions', to: '/admissions' },
  { label: 'Briefings', to: '/events' },
  { label: 'Fees', to: '/admissions#fees' },
  { label: 'Student hub', to: '/dashboard' },
] as const

export const HERO = {
  kicker: 'January 2027 ground-school intake — applications open',
  headline: 'Training that',
  headlineAccent: 'earns the left seat.',
  body: 'FADEC takes you from first briefing to airline right seat: ground school written to the licence syllabus, live instruction from current captains, simulator sessions and progress tests you can sit from anywhere.',
  primary: { label: 'Browse the course catalogue', to: '/programmes' },
  secondary: { label: 'Book a taster briefing', to: '/events' },
  credential: 'DGCA-aligned ground school · EASA ATO 1187 · Est. 2011',
}

export const STATS = [
  { value: '8', label: 'Programmes, from first solo to type rating' },
  { value: '1:9', label: 'Instructor to student ratio' },
  { value: '94%', label: 'First-attempt pass rate on ground papers' },
  { value: '1,600', label: 'Pilots trained since 2011' },
]

export const PILLARS = [
  { icon: 'video', title: 'Live ground school', body: 'Two live briefings a week with a current captain, each recorded and indexed by licence subject.', tone: 'violet' },
  { icon: 'calendar', title: 'A published timetable', body: 'Briefing times, simulator slots and exam windows are fixed before you enrol, not negotiated after.', tone: 'lime' },
  { icon: 'user', title: 'A named mentor', body: 'One instructor follows your cohort from first solo to skills test and signs your training record.', tone: 'amber' },
  { icon: 'award', title: 'Auditable outcomes', body: 'Every progress test maps to a syllabus reference, so your record stands up to an authority or airline audit.', tone: 'blue' },
] as const

export type Award = 'Licence' | 'Rating' | 'Certificate'
export type School = 'Flight training' | 'Ground school' | 'Simulator' | 'Safety & human factors'
export type Mode = 'Online' | 'Hybrid'

export type Module = { code: string; title: string; hours: number; core: boolean }
export type Stage = { label: string; modules: Module[] }
export type Cohort = { id: string; label: string; start: string; deadline: string; seats: number; taken: number; slot: string }

export type Programme = {
  slug: string
  title: string
  award: Award
  school: School
  mode: Mode
  duration: string
  hours: number
  image: ImageKey
  summary: string
  overview: string
  outcomes: string[]
  requirements: string[]
  lead: { name: string; role: string; image: ImageKey }
  curriculum: Stage[]
  cohorts: Cohort[]
  /** Total course fee. Flight hours are quoted separately where they apply. */
  fee: number
  hoursPerWeek: string
}

const m = (code: string, title: string, hours = 40, core = true): Module => ({ code, title, hours, core })

export const PROGRAMMES: Programme[] = [
  {
    slug: 'ppl-private-pilot-licence',
    title: 'Private Pilot Licence (PPL)',
    award: 'Licence',
    school: 'Flight training',
    mode: 'Hybrid',
    duration: '6 months',
    hours: 240,
    image: 'prog-computing',
    summary: 'Ground school, 45 flight hours and a skills test — the licence that lets you fly yourself, family and friends.',
    overview:
      'The PPL is where most pilots start. You complete nine ground subjects in evening briefings, fly 45 hours with the same instructor, and sit a skills test with an examiner. Ground school runs online; flight training runs from our base at Kestrel Works in blocks you book around work.',
    outcomes: [
      'Plan and fly a cross-country flight under visual flight rules',
      'Apply air law, meteorology and flight planning to a real route',
      'Pass the nine PPL ground examinations',
      'Hold a Class 2 medical and a valid radiotelephony licence',
    ],
    requirements: [
      'Age 17 before your skills test',
      'Class 2 medical certificate',
      'English at IELTS 5.5 or equivalent for the radiotelephony exam',
    ],
    lead: { name: 'Capt. Naveen Rao', role: 'Chief flying instructor', image: 'faculty-1' },
    curriculum: [
      { label: 'Ground school', modules: [m('PPL101', 'Air law'), m('PPL102', 'Aircraft general knowledge'), m('PPL103', 'Flight performance and planning'), m('PPL104', 'Human performance')] },
      { label: 'Flight phase', modules: [m('PPL201', 'Effects of controls and circuits'), m('PPL202', 'Navigation and cross-country'), m('PPL203', 'Instrument appreciation'), m('PPL204', 'Skills test preparation')] },
    ],
    cohorts: [
      { id: 'ppl-2701', label: 'January 2027', start: '2027-01-18', deadline: '2026-12-14', seats: 24, taken: 19, slot: 'Mon & Wed 18:30–20:30 GMT' },
      { id: 'ppl-2704', label: 'April 2027', start: '2027-04-19', deadline: '2027-03-15', seats: 24, taken: 7, slot: 'Tue & Thu 19:00–21:00 GMT' },
      { id: 'ppl-2709', label: 'September 2027', start: '2027-09-20', deadline: '2027-08-16', seats: 24, taken: 2, slot: 'Mon & Wed 12:30–14:30 GMT' },
    ],
    fee: 9800,
    hoursPerWeek: '10–12 h',
  },
  {
    slug: 'cpl-commercial-pilot-licence',
    title: 'Commercial Pilot Licence (CPL)',
    award: 'Licence',
    school: 'Flight training',
    mode: 'Hybrid',
    duration: '18 months',
    hours: 720,
    image: 'prog-health',
    summary: 'The professional licence: 200 flight hours, fourteen ground subjects and a commercial skills test.',
    overview:
      'A full-time route to a commercial licence. You complete fourteen ground subjects, build 200 flight hours including 100 hours as pilot in command, and finish with a commercial skills test and instrument rating. Training records are kept to authority format from day one.',
    outcomes: [
      'Hold a commercial licence with instrument privileges',
      'Command a cross-country flight in controlled airspace',
      'Pass all fourteen CPL ground examinations',
      'Keep a training record that survives an authority audit',
    ],
    requirements: [
      'Age 18 before licence issue',
      'Class 1 medical certificate',
      'PPL with 150 hours, or join our integrated zero-to-CPL route',
    ],
    lead: { name: 'Capt. Naveen Rao', role: 'Head of flight training', image: 'faculty-1' },
    curriculum: [
      { label: 'Year 1', modules: [m('CPL101', 'Air law', 60), m('CPL102', 'Meteorology', 60), m('CPL103', 'Navigation', 60), m('CPL104', 'Aircraft general knowledge', 60)] },
      { label: 'Year 2', modules: [m('CPL201', 'Instrumentation and radio nav', 50, false), m('CPL202', 'Human performance and limitations', 40), m('CPL203', 'Flight planning and performance', 60), m('CPL204', 'Commercial skills test preparation', 80)] },
    ],
    cohorts: [
      { id: 'cpl-2701', label: 'January 2027', start: '2027-01-11', deadline: '2026-12-11', seats: 20, taken: 16, slot: 'Mon–Fri 09:30–12:30 GMT' },
      { id: 'cpl-2705', label: 'May 2027', start: '2027-05-10', deadline: '2027-04-09', seats: 20, taken: 4, slot: 'Mon–Fri 14:00–17:00 GMT' },
    ],
    fee: 24500,
    hoursPerWeek: '24 h',
  },
  {
    slug: 'atpl-ground-school',
    title: 'ATPL Ground School (frozen ATPL)',
    award: 'Licence',
    school: 'Ground school',
    mode: 'Online',
    duration: '9 months',
    hours: 650,
    image: 'prog-data',
    summary: 'Thirteen ATPL subjects with question banks, timed mocks and an instructor on call — no flight hours required.',
    overview:
      'The theory half of an airline career, taught for people who work. Thirteen subjects run in three blocks, each ending with timed mocks marked to the real exam standard. Study is asynchronous with two live clinics a week, so time zones are not a barrier.',
    outcomes: [
      'Pass all thirteen ATPL ground examinations',
      'Work performance, mass and balance calculations to exam standard',
      'Interpret meteorology, instruments and flight planning data',
      'Sit timed mocks at the real pass mark before booking the authority exam',
    ],
    requirements: [
      'Age 17 or over',
      'Class 1 medical before licence issue, Class 2 to enrol',
      'English at IELTS 6.0 or equivalent',
    ],
    lead: { name: 'Dr Amara Osei', role: 'Head of ground school', image: 'faculty-3' },
    curriculum: [
      { label: 'Block 1', modules: [m('AT101', 'Air law and ATC procedures', 50), m('AT102', 'Aircraft general knowledge', 60), m('AT103', 'Instruments', 50), m('AT104', 'Mass and balance', 30)] },
      { label: 'Block 2', modules: [m('AT201', 'Performance', 40), m('AT202', 'Flight planning', 50), m('AT203', 'Human performance', 40), m('AT204', 'Meteorology', 60)] },
      { label: 'Block 3', modules: [m('AT301', 'General navigation', 50), m('AT302', 'Radio navigation', 40), m('AT303', 'Operational procedures', 40), m('AT304', 'Principles of flight', 50), m('AT305', 'Communications', 30)] },
    ],
    cohorts: [
      { id: 'atpl-2702', label: 'February 2027', start: '2027-02-01', deadline: '2026-12-21', seats: 40, taken: 29, slot: 'Self-paced + live clinics Wed 18:00–20:00 GMT' },
      { id: 'atpl-2710', label: 'October 2027', start: '2027-10-04', deadline: '2027-08-23', seats: 40, taken: 6, slot: 'Self-paced + live clinics Wed 18:00–20:00 GMT' },
    ],
    fee: 4200,
    hoursPerWeek: '16–18 h',
  },
  {
    slug: 'instrument-rating',
    title: 'Instrument Rating (IR)',
    award: 'Rating',
    school: 'Flight training',
    mode: 'Hybrid',
    duration: '10 weeks',
    hours: 190,
    image: 'prog-business',
    summary: 'Fly in cloud and to minima: 50 hours instrument time, sim sessions and an IR skills test.',
    overview:
      'For pilots who already hold a CPL. Ten weeks of instrument flying, procedural work and approach practice, half in the simulator and half in the aircraft, ending with an IR skills test on a multi-engine type.',
    outcomes: [
      'Fly a precision and a non-precision approach to minima',
      'Manage workload and decision-making in instrument conditions',
      'Apply instrument departure and arrival procedures correctly',
      'Pass the IR skills test with an examiner',
    ],
    requirements: [
      'CPL with 50 hours cross-country command',
      'Class 1 medical',
      'English at IELTS 6.0 or equivalent',
    ],
    lead: { name: 'Capt. Naveen Rao', role: 'Head of flight training', image: 'faculty-1' },
    curriculum: [
      { label: '10 weeks', modules: [m('IR501', 'Instrument flight procedures', 50), m('IR502', 'Approach and holding', 50), m('IR503', 'Simulator assessment', 40), m('IR504', 'Skills test preparation', 50)] },
    ],
    cohorts: [
      { id: 'ir-2701', label: 'January 2027', start: '2027-01-20', deadline: '2027-01-06', seats: 16, taken: 12, slot: 'Mon–Thu 08:00–13:00 GMT' },
      { id: 'ir-2703', label: 'March 2027', start: '2027-03-10', deadline: '2027-02-24', seats: 16, taken: 3, slot: 'Mon–Thu 13:00–18:00 GMT' },
    ],
    fee: 11400,
    hoursPerWeek: '22 h',
  },
  {
    slug: 'mcc-joc',
    title: 'MCC / JOC — Multi-Crew Cooperation',
    award: 'Rating',
    school: 'Simulator',
    mode: 'Hybrid',
    duration: '3 weeks',
    hours: 80,
    image: 'prog-psych',
    summary: 'The airline entry course: two-crew procedures, threat management and a full LOFT scenario in the sim.',
    overview:
      'Runs on the fixed-base A320 simulator with a current line captain in the right seat. Three weeks of SOPs, callouts and joint decision-making, ending with a line-oriented flight training scenario assessed against airline standards.',
    outcomes: [
      'Operate as a member of a two-pilot crew to SOP',
      'Apply threat and error management in a live scenario',
      'Brief and debrief a sector using a structured model',
      'Complete a LOFT scenario to airline standard',
    ],
    requirements: [
      'CPL/IR, or an ATPL with instrument privileges',
      'Class 1 medical',
      'English at ICAO level 4 or above',
    ],
    lead: { name: 'Capt. Tomas Rehn', role: 'Head of simulator training', image: 'faculty-2' },
    curriculum: [
      { label: '3 weeks', modules: [m('MCC601', 'Multi-crew procedures', 30), m('MCC602', 'Threat and error management', 20), m('MCC603', 'LOFT assessment', 30)] },
    ],
    cohorts: [
      { id: 'mcc-2701', label: 'January 2027', start: '2027-01-25', deadline: '2026-12-18', seats: 12, taken: 9, slot: 'Mon–Fri 09:00–15:00 GMT' },
    ],
    fee: 3600,
    hoursPerWeek: '26 h',
  },
  {
    slug: 'a320-type-rating-ground-school',
    title: 'A320 Type Rating Ground School',
    award: 'Rating',
    school: 'Simulator',
    mode: 'Hybrid',
    duration: '8 weeks',
    hours: 260,
    image: 'prog-a320',
    summary: 'Systems, SOPs and performance for the A320 family, taught by line training captains before your sim slot.',
    overview:
      'The knowledge half of an A320 type rating. Systems are taught aircraft by aircraft panel, with SOP drills in the fixed-base simulator and a final assessment in the same format the training organisation uses for the full type rating.',
    outcomes: [
      'Describe A320 systems to type-rating depth',
      'Operate normal and abnormal procedures to SOP',
      'Compute take-off and landing performance from the charts',
      'Pass the type ground assessment at first attempt',
    ],
    requirements: [
      'CPL/IR or ATPL, with MCC completed',
      'Class 1 medical',
      'English at ICAO level 4 or above',
    ],
    lead: { name: 'Capt. Tomas Rehn', role: 'A320 training captain', image: 'faculty-2' },
    curriculum: [
      { label: 'Term 1', modules: [m('TR701', 'A320 general and airframe', 40), m('TR702', 'Flight controls and hydraulics', 40), m('TR703', 'Powerplant and fuel', 40)] },
      { label: 'Term 2', modules: [m('TR704', 'Automation and flight management', 40), m('TR705', 'Performance and mass and balance', 30), m('TR706', 'Abnormal and emergency procedures', 40), m('TR707', 'Ground assessment', 30)] },
    ],
    cohorts: [
      { id: 'tr-2702', label: 'February 2027', start: '2027-02-08', deadline: '2027-01-25', seats: 18, taken: 11, slot: 'Mon–Fri 08:30–13:00 GMT' },
    ],
    fee: 7900,
    hoursPerWeek: '28 h',
  },
  {
    slug: 'radiotelephony-aviation-english',
    title: 'Radiotelephony & Aviation English',
    award: 'Certificate',
    school: 'Ground school',
    mode: 'Online',
    duration: '8 weeks',
    hours: 64,
    image: 'prog-design',
    summary: 'Standard phraseology, readback discipline and ICAO level 4 English, with live RT practice every week.',
    overview:
      'A short course for student pilots and for licensed pilots who need ICAO level 4 on record. Each week pairs phraseology drills with live radio practice in a simulated frequency, and the final assessment mirrors the authority RT exam.',
    outcomes: [
      'Use standard phraseology without ambiguity',
      'Read back clearances correctly under workload',
      'Handle abnormal and emergency RT exchanges',
      'Reach ICAO language level 4 on the assessed scale',
    ],
    requirements: ['Age 16 or over', 'English at IELTS 5.0 or equivalent to start'],
    lead: { name: 'Sofia Marchetti', role: 'Aviation English examiner', image: 'faculty-2' },
    curriculum: [
      { label: '8 weeks', modules: [m('RT801', 'Standard phraseology', 20), m('RT802', 'Clearances and readback', 20), m('RT803', 'Assessed RT test', 12, false)] },
    ],
    cohorts: [
      { id: 'rt-2702', label: 'February 2027', start: '2027-02-03', deadline: '2027-01-20', seats: 30, taken: 21, slot: 'Wed 18:00–19:30 GMT' },
    ],
    fee: 620,
    hoursPerWeek: '4 h',
  },
  {
    slug: 'human-factors-crm',
    title: 'Human Factors & Crew Resource Management',
    award: 'Certificate',
    school: 'Safety & human factors',
    mode: 'Online',
    duration: '6 weeks',
    hours: 48,
    image: 'prog-human-factors',
    summary: 'Decision-making, fatigue and communication for the flight deck, with case studies from real occurrences.',
    overview:
      'The human performance syllabus, taught through occurrence reports rather than theory slides. Each week ends with a decision you have to defend in a short written brief, and the capstone is a CRM session run in the simulator.',
    outcomes: [
      'Explain human performance limits in flight operations',
      'Recognise and counter fatigue and startle effects',
      'Lead a structured debrief after a difficult sector',
      'Apply a recognised error model to an occurrence',
    ],
    requirements: ['No formal qualifications needed', 'English at IELTS 6.0 or equivalent'],
    lead: { name: 'Sofia Marchetti', role: 'Head of safety and human factors', image: 'faculty-2' },
    curriculum: [
      { label: '6 weeks', modules: [m('HF901', 'Human performance and limitations', 18), m('HF902', 'Communication and leadership', 18), m('HF903', 'Occurrence case study', 12)] },
    ],
    cohorts: [
      { id: 'hf-2703', label: 'March 2027', start: '2027-03-01', deadline: '2027-02-15', seats: 28, taken: 10, slot: 'Thu 18:00–19:30 GMT' },
    ],
    fee: 480,
    hoursPerWeek: '3 h',
  },
]

export const AWARDS: Award[] = ['Licence', 'Rating', 'Certificate']
export const SCHOOLS: School[] = ['Flight training', 'Ground school', 'Simulator', 'Safety & human factors']
export const MODES: Mode[] = ['Online', 'Hybrid']

export const PAYMENT_PLANS = [
  { id: 'upfront', label: 'Pay in full', note: '5% off the course fee when paid before day one', discount: 0.05, instalments: 1 },
  { id: 'termly', label: 'Pay by phase', note: 'Three payments across the course', discount: 0, instalments: 3 },
  { id: 'monthly', label: 'Pay monthly', note: 'Ten payments across the course', discount: 0, instalments: 10 },
] as const
export type PlanId = (typeof PAYMENT_PLANS)[number]['id']

export const SCHOLARSHIPS = [
  { id: 'none', label: 'No scholarship', amount: 0 },
  { id: 'access', label: 'Access bursary (first in family)', amount: 0.25 },
  { id: 'global', label: 'Global talent (outside UK)', amount: 0.15 },
  { id: 'alumni', label: 'FADEC alumni', amount: 0.1 },
] as const
export type ScholarshipId = (typeof SCHOLARSHIPS)[number]['id']

export const ADMISSIONS = {
  steps: [
    { title: 'Choose a course and intake', body: 'Compare timetable, simulator blocks and fees, then pick the intake you will join.' },
    { title: 'Apply online', body: 'Five short steps. Your draft saves as you go, so you can return to it later.' },
    { title: 'Training assessment', body: 'A 20-minute call with a training captain, plus a check that your medical is in place.' },
    { title: 'Enrol and register', body: 'Decisions within ten working days. Accept, pay the deposit and join your cohort.' },
  ],
  requirements: [
    { title: 'Certificates', body: 'No formal qualifications for short courses. Ground-school subjects assume GCSE-level mathematics and physics.' },
    { title: 'Licences and ratings', body: 'A current medical is required: Class 2 for a PPL, Class 1 for anything professional. We can point you to an examiner.' },
    { title: 'Prior flying', body: 'Logged hours count towards a CPL or IR. Send your logbook summary with the application and we will assess it.' },
  ],
  faqs: [
    { q: 'Does FADEC award licences?', a: 'No. FADEC delivers ground-school knowledge and signs your training record; the licence itself is issued by the competent authority after your examinations and flight test. Each course states which authority requirements it maps to.' },
    { q: 'What if I miss a live briefing?', a: 'Every briefing is recorded and posted within the hour, indexed by licence subject. Attendance of 70% of live sessions is required each phase; your mentor can agree exceptions.' },
    { q: 'Can I switch cohorts?', a: 'Once per course, into any later intake with space, at no fee. Completed subject passes move with you.' },
    { q: 'How do deposits and refunds work?', a: 'A $500 deposit holds your seat and comes off your first payment. It is fully refundable until 14 days before your start date.' },
    { q: 'Are flight hours included in the fee?', a: 'Ground school and simulator time are included. Aircraft hours are quoted per hour at cost, and you only pay for the hours you fly.' },
  ],
  deposit: 500,
}

export type EventType = 'Open day' | 'Webinar' | 'Taster class' | 'Q&A' | 'Community'
export type Event = { id: string; title: string; type: EventType; date: string; time: string; length: string; host: string; body: string; seats: number; taken: number; programme?: string }

export const EVENT_TYPES: EventType[] = ['Open day', 'Webinar', 'Taster class', 'Q&A', 'Community']

export const EVENTS: Event[] = [
  { id: 'ev-open-nov', title: 'Flight deck open day', type: 'Open day', date: '2026-11-28', time: '11:00 GMT', length: '3 h', host: 'Admissions team', body: 'Sit in the fixed-base simulator, watch two live ground-school briefings and put your medical and funding questions to training captains.', seats: 300, taken: 218 },
  { id: 'ev-taster-weather', title: 'Taster: reading a METAR and planning a cross-country', type: 'Taster class', date: '2026-12-02', time: '18:30 GMT', length: '60 min', host: 'Capt. Naveen Rao', body: 'A real PPL meteorology and navigation briefing, shortened. Bring a route and we will plan it together.', seats: 60, taken: 41, programme: 'ppl-private-pilot-licence' },
  { id: 'ev-funding', title: 'Funding a CPL: loans, bursaries and cadet schemes', type: 'Q&A', date: '2026-12-05', time: '13:00 GMT', length: '45 min', host: 'Student finance', body: 'Payment plans, bank loans, airline cadet programmes and how to apply for each.', seats: 200, taken: 88 },
  { id: 'ev-atpl-webinar', title: 'ATPL ground school information evening', type: 'Webinar', date: '2026-12-09', time: '18:00 GMT', length: '75 min', host: 'Dr Amara Osei', body: 'How the thirteen subjects run alongside a full-time job, with two current students.', seats: 150, taken: 150, programme: 'atpl-ground-school' },
  { id: 'ev-sim-clinic', title: 'Simulator assessment clinic', type: 'Taster class', date: '2026-12-11', time: '15:00 GMT', length: '90 min', host: 'Capt. Tomas Rehn', body: 'Watch an MCC session debrief in the A320 sim, then ask what airlines look for in a first officer.', seats: 80, taken: 23, programme: 'mcc-joc' },
  { id: 'ev-apply-clinic', title: 'Application clinic', type: 'Q&A', date: '2026-12-12', time: '10:00 GMT', length: '2 h', host: 'Admissions team', body: 'Drop in with your logbook summary and get feedback before the January deadline.', seats: 120, taken: 52 },
  { id: 'ev-alumni', title: 'Alumni evening: first officer to captain', type: 'Community', date: '2027-01-14', time: '19:00 GMT', length: '60 min', host: 'Alumni network', body: 'Four graduates on the first airline job, the type rating and the move to the left seat.', seats: 250, taken: 97 },
  { id: 'ev-open-feb', title: 'Spring open day', type: 'Open day', date: '2027-02-20', time: '11:00 GMT', length: '3 h', host: 'Admissions team', body: 'For April, May and September 2027 intakes.', seats: 300, taken: 34 },
]

export const VOICES = [
  { quote: 'The ATPL mocks are marked to the real standard, so the authority exam felt like the fourth attempt, not the first.', name: 'Priya N.', role: 'ATPL ground school, 2025', image: 'cam-student-2' as ImageKey },
  { quote: 'My instructor flew every navigation leg with me, then sat in on the skills test as safety pilot. Nothing about the checkride was a surprise.', name: 'Theo B.', role: 'Commercial Pilot Licence, 2024', image: 'cam-student-1' as ImageKey },
  { quote: 'We brief the sim scenario for twenty minutes before anyone touches the aircraft. That habit is the whole course.', name: 'Capt. Tomas Rehn', role: 'Head of simulator training', image: 'faculty-2' as ImageKey },
]

export const HUB_PROMO = {
  title: 'Your week, published before you enrol',
  body: 'Briefing times, simulator slots and exam windows are fixed in advance. Once you start, the student hub holds your timetable, progress tests and signed-off training record in one place.',
}

/* ---------- Student hub seed data (demo student) ---------- */

export const DEMO_STUDENT = { name: 'Jordan Ellis', email: 'jordan@example.com', id: 'CPL-24-01873', programme: 'cpl-commercial-pilot-licence', cohort: 'CPL cohort 14, January 2026', tutor: 'Capt. Naveen Rao' }

export type SessionKind = 'Briefing' | 'Ground school' | 'Simulator' | 'Tutorial'
export type ClassSession = { id: string; day: 0 | 1 | 2 | 3 | 4 | 5; start: string; end: string; code: string; title: string; kind: SessionKind; who: string; room: string }

/** The demo student's weekly timetable (day 0 = Monday). */
export const TIMETABLE: ClassSession[] = [
  { id: 't1', day: 0, start: '18:30', end: '20:00', code: 'CPL101', title: 'Air law', kind: 'Ground school', who: 'Capt. Naveen Rao', room: 'Live room 2' },
  { id: 't2', day: 0, start: '20:00', end: '20:30', code: 'CPL101', title: 'Air law question clinic', kind: 'Tutorial', who: 'Sam Okafor', room: 'Breakout 4' },
  { id: 't3', day: 1, start: '12:30', end: '13:00', code: 'TUT', title: 'Mentor check-in', kind: 'Tutorial', who: 'Capt. Naveen Rao', room: 'Video call' },
  { id: 't4', day: 2, start: '18:30', end: '20:30', code: 'CPL102', title: 'Meteorology', kind: 'Ground school', who: 'Dr Amara Osei', room: 'Live room 1' },
  { id: 't5', day: 3, start: '19:00', end: '20:30', code: 'CPL203', title: 'Flight planning clinic', kind: 'Briefing', who: 'Sofia Marchetti', room: 'Briefing room 3' },
  { id: 't6', day: 5, start: '10:00', end: '11:30', code: 'SIM', title: 'Simulator session (optional)', kind: 'Simulator', who: 'Capt. Tomas Rehn', room: 'Sim bay 1' },
]

export type Grade = { code: string; title: string; hours: number; items: { name: string; weight: number; mark: number | null }[] }

export const GRADES: Grade[] = [
  { code: 'CPL101', title: 'Air law', hours: 60, items: [{ name: 'Weekly papers', weight: 0.3, mark: 84 }, { name: 'Mock examination', weight: 0.7, mark: 78 }] },
  { code: 'CPL102', title: 'Meteorology', hours: 60, items: [{ name: 'Chart interpretation', weight: 0.4, mark: 71 }, { name: 'Written paper', weight: 0.6, mark: 73 }] },
  { code: 'CPL103', title: 'Navigation', hours: 60, items: [{ name: 'Nav log pack', weight: 0.5, mark: 88 }, { name: 'Mock examination', weight: 0.5, mark: 81 }] },
  { code: 'CPL104', title: 'Aircraft general knowledge', hours: 60, items: [{ name: 'Systems paper', weight: 1, mark: 66 }] },
  { code: 'CPL201', title: 'Instrumentation and radio nav', hours: 50, items: [{ name: 'Progress test', weight: 0.4, mark: 76 }, { name: 'Exam', weight: 0.6, mark: null }] },
  { code: 'CPL202', title: 'Human performance and limitations', hours: 40, items: [{ name: 'Case briefs', weight: 0.5, mark: 70 }, { name: 'Written paper', weight: 0.5, mark: null }] },
]

export const ASSIGNMENTS = [
  { id: 'a1', code: 'CPL102', title: 'Met briefing write-up: a winter front', due: '2026-11-17' },
  { id: 'a2', code: 'CPL103', title: 'Navigation log: cross-country plan', due: '2026-11-20' },
  { id: 'a3', code: 'CPL101', title: 'Air law progress test 6', due: '2026-11-24' },
  { id: 'a4', code: 'TUT', title: 'Book your end-of-phase review', due: '2026-12-01' },
]

/** The "today" the hub's week view and due dates are anchored to. */
export const HUB_TODAY = '2026-11-12'

export const FOOTER = {
  blurb: 'FADEC is a pilot-training academy used for this project. Replace this line with your own registration and approval details.',
  columns: [
    { title: 'Study', links: [{ label: 'All courses', to: '/programmes' }, { label: 'Licences', to: '/programmes?award=Licence' }, { label: 'Certificates', to: '/programmes?award=Certificate' }, { label: 'Briefings', to: '/events' }] },
    { title: 'Apply', links: [{ label: 'Admissions', to: '/admissions' }, { label: 'Fees and funding', to: '/admissions#fees' }, { label: 'Start an application', to: '/apply' }] },
    { title: 'Students', links: [{ label: 'Student hub', to: '/dashboard' }, { label: 'Style guide', to: '/styleguide' }] },
  ],
}
