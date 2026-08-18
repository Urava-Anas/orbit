-- Expand the persisted Lead Finder brief limits to match the dedicated Add Lead workspace.
-- Individual result niches remain capped at 100 characters; the search brief may contain
-- up to eight comma-separated niches and can request up to 100 review candidates.

alter table public.lead_finder_searches
  drop constraint if exists lead_finder_searches_query_text_check,
  drop constraint if exists lead_finder_searches_niche_check,
  drop constraint if exists lead_finder_searches_requested_count_check,
  drop constraint if exists lead_finder_searches_result_count_check;

alter table public.lead_finder_searches
  add constraint lead_finder_searches_query_text_check
    check (char_length(query_text) between 3 and 700),
  add constraint lead_finder_searches_niche_check
    check (char_length(niche) between 2 and 500),
  add constraint lead_finder_searches_requested_count_check
    check (requested_count between 1 and 100),
  add constraint lead_finder_searches_result_count_check
    check (result_count between 0 and 100);
