# Urava Foundry Role Experience

## Product decision

Orbit uses one authentication entrance and two automatic role destinations. The
login screen never asks a person to choose Founder or Student. Role and record
membership decide the destination after Google sign-in.

The frontend now has two explicit role modes:

- Founder mode: dark Orbit command language, dense enough for decisions but not
  a wall of reports.
- Student mode: warm ivory, Urava red, low-bandwidth and Roman-Urdu-first.

They share typography, spacing, radius, feedback, focus and status rules, but
they do not share the same information hierarchy.

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

The first screen always promotes one recommended next move. It is selected from
pending submissions, students who need support, or the student roster in that
order.

The Founder may see:

- Every Foundry student in the organisation
- Attendance, tasks, submissions, feedback and progress
- Student health and learning-support signals
- Studio-readiness evidence
- Foundry configuration and capacity

The Founder can now:

- maintain the complete learning and support record for each student;
- schedule a class, move it through its valid lifecycle and open its room;
- save the eligible class roster in one attendance command;
- publish and assign work atomically;
- review submissions and record evidence-backed skill scores;
- manage Foundry seat capacity without exposing internal settings to students.

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

Founder-side portal preview is deliberately non-mutating. Inputs and submission
are disabled there so a design review cannot change a learner's real record.

The Student may see:

- Only their own permanent Foundry record
- Their next task and recovery task
- Their own class schedule
- Their own submissions and teacher feedback
- Their own progress, skills, badges and Studio-readiness state
- Their own unread assignment, review and class updates

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

Implemented frontend states:

- Founder loading and secure-retry error
- Student loading and supportive retry error
- Student access pending with account-linking steps
- Work awaiting teacher review
- No assigned task today
- Recovery task
- Empty class, task, submission and progress states
- Pending and duplicate-click-safe command buttons
- Read and unread student notifications
- Scheduled, live, completed and cancelled class states

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

## Current V1 boundary

Orbit Foundry V1 now includes the role resolver, live student data, atomic
learning commands, notification inbox, class lifecycle, attendance roster and
Founder operating controls.

The following remain deliberately separate integrations:

- connecting a student identity before that student completes Google sign-in;
- outbound email, WhatsApp or push delivery;
- Airtable or Notion background workers consuming the durable Foundry outbox;
- email/password authentication controls, including leaked-password
  protection, while Orbit remains Google-only.
