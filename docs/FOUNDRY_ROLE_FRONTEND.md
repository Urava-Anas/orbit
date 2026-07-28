# Urava Foundry Role Experience

## Product decision

Orbit uses one authentication entrance and two automatic role destinations. The
login screen never asks a person to choose Founder or Student. Role and record
membership will decide the destination when backend routing is connected.

## Founder role

Purpose: tell the Founder who is progressing, who needs help and who is ready
for real work.

Primary navigation:

1. Home
2. Students
3. Classes
4. Tasks
5. Studio
6. More

The Founder experience prioritises decisions over reports. `Needs Attention
Today` is the main operating queue. Every signal must open the real student,
submission, task or class that caused it.

The Founder may see:

- Every Foundry student in the organisation
- Attendance, tasks, submissions, feedback and progress
- Student health and learning-support signals
- Studio-readiness evidence
- Foundry configuration and capacity

## Student role

Purpose: make the next learning action obvious for a student with limited
device access, English confidence or digital experience.

Primary navigation:

1. Today
2. Learn
3. Submit
4. Progress
5. Profile

The Today screen has one primary action. Class joining and teacher feedback are
secondary. Instructions default to Roman Urdu, while an English-preferring
student receives English task instructions when available.

The Student may see:

- Only their own permanent Foundry record
- Their next task and recovery task
- Their own class schedule
- Their own submissions and teacher feedback
- Their own progress, skills, badges and Studio-readiness state

The Student must never see:

- Another student
- Founder notes
- Cohort risk queues
- Other students' attendance, submissions or scores
- Foundry configuration or capacity

## Shared frontend states

Both roles need designed states for:

- Loading
- Empty
- Error
- Access pending
- No task today
- No class scheduled
- Submission awaiting review
- Recovery task
- Studio Ready

## Backend integration contract

The frontend expects one post-auth role resolver:

```text
authenticated user
  -> owner/admin membership
     -> /dashboard/foundry
  -> linked Foundry student record
     -> /learn
  -> neither
     -> /learn access-pending
```

Supabase should remain the operational source of truth. Airtable can remain the
admissions intake source and Notion can remain the operating knowledge source,
but the frontend must receive one normalised Foundry student record.

Backend work must enforce the same rules with row-level security. Hiding a link
or page in the frontend is not authorisation.
