# Orbit Relay

Orbit Relay is Orbit's workspace-native business communication control layer. The provider backend remains pluggable; the product surface is designed first so Gmail, Microsoft 365, IMAP/SMTP, Namecheap Private Email, Resend, Postmark, SendGrid, Mailgun, SES and future providers can connect without changing the core UX.

## Product surfaces
- Unified Inbox: Inbox, Sent, Drafts, Scheduled, Archive, Spam, Trash, Starred.
- Multiple workspace mailboxes and aliases.
- Shared inbox and role-aware team access.
- Threaded conversations with business context linking.
- AI assist: summaries, suggested replies, extraction and next actions.
- Smart categories, rules, labels and routing.
- Green / Amber / Red communication authority and approval queue.
- Templates, snippets, signatures and personalization variables.
- Attachments and document context.
- Search, snooze, reminders and follow-up sequences.
- Scheduling and controlled outreach sequences.
- Forms, Leads, Sales, Dispatch, Finance and Calendar context hooks.
- Delivery/bounce/engagement tracking surface.
- Deliverability, SPF/DKIM/DMARC and suppression health surface.
- Audit trail and role permissions.
- Communication analytics and founder attention signals.
- Webhook/API and automation hooks.

## Backend boundary
Provider credentials, inbound sync, outbound dispatch, webhook processing and message-provider state are deliberately isolated behind connector contracts. The current product surface must never pretend a provider action succeeded when no provider is connected.
