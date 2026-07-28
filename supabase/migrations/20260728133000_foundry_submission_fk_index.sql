create index foundry_submissions_workspace_assignment_student_idx
  on public.foundry_submissions(workspace_id, assignment_id, student_id);
