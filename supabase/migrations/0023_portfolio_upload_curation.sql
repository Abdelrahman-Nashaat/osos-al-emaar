-- 0023_portfolio_upload_curation.sql
-- Tighten Slice-2 attachment INSERT for the portfolio: gallery images are
-- curated content. Visibility stays portfolio.view (all staff), but ADDING a
-- portfolio attachment now requires portfolio.edit at the DB and storage
-- layers (matching the server-action gate; previously any viewer class could
-- insert because visible ⇒ uploadable).

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and public.attachment_visible(entity_type)
    and (entity_type <> 'portfolio' or public.has_perm('portfolio.edit'))
  );

drop policy if exists attachments_objects_insert on storage.objects;
create policy attachments_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and owner_id = (select auth.uid()::text)
    and public.storage_attachment_visible(name)
    and (split_part(name, '/', 1) <> 'portfolio' or public.has_perm('portfolio.edit'))
  );
