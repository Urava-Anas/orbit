-- Relay approval-pending messages need a real outbox state. This keeps them
-- distinct from Sent until SMTP accepts the message.
alter table public.orbit_mail_threads
  drop constraint if exists orbit_mail_threads_folder_check;

alter table public.orbit_mail_threads
  add constraint orbit_mail_threads_folder_check
  check (folder in ('inbox','outbox','sent','drafts','archive','spam','trash'));
