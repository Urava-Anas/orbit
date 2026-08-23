# Apex online forms in Orbit

Apex website trial requests are now treated as operational carrier intake, not as email-only notifications.

Flow:

`apexlogisticsdispatch.com form -> Supabase Edge intake -> apex_online_form_submissions -> Apex workspace -> Carrier Pipeline -> Online Forms`

The existing FormSubmit email notification remains active in parallel so form delivery still reaches `info@apexlogisticsdispatch.com` while Orbit becomes the operational source of truth.

Security:
- Public edge intake only accepts POST requests from the Apex production origins.
- Required fields are validated and bounded before insert.
- Inserts use the server-side service role inside the Edge Function; the browser never receives privileged database credentials.
- Authenticated Orbit users can only read records for workspaces they belong to.
- Only workspace admins can update submission records.
