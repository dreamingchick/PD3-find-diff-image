-- Dedicated PD3 staging project only. No player accounts or public content.
begin;
grant usage on schema public to authenticated,service_role;

create table public.pd3_members (
 user_id uuid primary key references auth.users(id),
 role text not null check (role in ('editor','reviewer','owner')),
 active boolean not null default true
);
alter table public.pd3_members enable row level security;
revoke all on public.pd3_members from public,anon,authenticated,service_role;
grant select on public.pd3_members to authenticated,service_role;
create policy member_self on public.pd3_members for select to authenticated using (user_id=(select auth.uid()));

create function public.pd3_role() returns text language sql stable security invoker set search_path='' as $$
 select role from public.pd3_members where user_id=(select auth.uid()) and active
$$;
revoke all on function public.pd3_role() from public,anon;
grant execute on function public.pd3_role() to authenticated,service_role;

create table public.pd3_review_requests (
 digest text primary key check (digest ~ '^[a-f0-9]{64}$'),
 draft jsonb not null,
 images jsonb not null,
 canonical text not null check (octet_length(canonical)<=200000),
 review_request jsonb not null,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 upload_complete boolean not null default false
);
alter table public.pd3_review_requests enable row level security;
revoke all on public.pd3_review_requests from public,anon,authenticated,service_role;
grant select on public.pd3_review_requests to authenticated,service_role;
grant insert(digest,draft,images,canonical,review_request) on public.pd3_review_requests to authenticated;
grant update(upload_complete) on public.pd3_review_requests to authenticated;
create policy request_read on public.pd3_review_requests for select to authenticated using (
 public.pd3_role() in ('owner','reviewer') or (public.pd3_role()='editor' and created_by=(select auth.uid()))
);
create policy request_create on public.pd3_review_requests for insert to authenticated with check (
 public.pd3_role() in ('editor','reviewer','owner') and created_by=(select auth.uid()) and not upload_complete
);
create policy request_finish on public.pd3_review_requests for update to authenticated using (
 public.pd3_role() in ('editor','reviewer','owner') and created_by=(select auth.uid()) and not upload_complete
) with check (created_by=(select auth.uid()) and upload_complete);
create index pd3_requests_creator on public.pd3_review_requests(created_by,created_at desc);

create function public.pd3_request_guard() returns trigger language plpgsql security invoker set search_path='' as $$
declare im jsonb; ordinal integer; actual_images jsonb;
begin
 if tg_op='UPDATE' then
  if old.upload_complete or not new.upload_complete or
     (to_jsonb(new)-'upload_complete') is distinct from (to_jsonb(old)-'upload_complete') then
   raise exception 'immutable request';
  end if;
  if exists (select 1 from jsonb_array_elements(new.images) x where not exists (
   select 1 from storage.objects o where o.bucket_id='pd3-review-images' and o.name=x->>'path'
  )) then raise exception 'image upload incomplete'; end if;
  return new;
 end if;
 if jsonb_typeof(new.draft) is distinct from 'object' or jsonb_typeof(new.images) is distinct from 'array'
    or jsonb_array_length(new.images)<>2 or octet_length(new.draft::text)>100000
    or jsonb_typeof(new.draft->'title') is distinct from 'string' or char_length(new.draft->>'title') not between 1 and 120
    or coalesce(new.draft->>'id','') !~ '^[A-Za-z0-9_-]{1,80}$' or new.draft->>'id' in ('__proto__','constructor','prototype') then
  raise exception 'invalid request metadata';
 end if;
 ordinal:=0;
 for im in select value from jsonb_array_elements(new.images) loop
  if jsonb_typeof(im) is distinct from 'object' or jsonb_typeof(im->'name') is distinct from 'string'
   or char_length(im->>'name')>160 or coalesce(im->>'sha256','') !~ '^[a-f0-9]{64}$'
   or coalesce(im->>'mime','') not in ('image/png','image/webp')
   or (im->>'path') is distinct from (new.digest||'/'||ordinal::text||'.'||case im->>'mime' when 'image/png' then 'png' else 'webp' end) then
   raise exception 'invalid image reference';
  end if;
  ordinal:=ordinal+1;
 end loop;
 select jsonb_agg(jsonb_build_object('name',x->>'name','sha256',x->>'sha256') order by n)
 into actual_images from jsonb_array_elements(new.images) with ordinality as a(x,n);
 if new.canonical::jsonb is distinct from jsonb_build_object('draft',new.draft,'images',actual_images)
  or encode(sha256(convert_to(new.canonical,'UTF8')),'hex')<>new.digest
  or jsonb_typeof(new.review_request) is distinct from 'object' or octet_length(new.review_request::text)>2000
  or new.review_request->'version' is distinct from '1'::jsonb
  or new.review_request->>'contentDigest' is distinct from new.digest
  or new.review_request->'testPlayCleared' is distinct from 'true'::jsonb
  or new.review_request->'semanticReviewConfirmed' is distinct from 'true'::jsonb then
  raise exception 'missing or stale content-bound request';
 end if;
 return new;
end $$;
revoke all on function public.pd3_request_guard() from public,anon,authenticated;
create trigger pd3_request_immutable before insert or update on public.pd3_review_requests for each row execute function public.pd3_request_guard();

create table public.pd3_review_validations (
 digest text primary key references public.pd3_review_requests(digest),
 passed boolean not null,
 validator_version text not null check (char_length(validator_version) between 1 and 80),
 message text not null check (char_length(message)<=500),
 created_at timestamptz not null default now()
);
alter table public.pd3_review_validations enable row level security;
revoke all on public.pd3_review_validations from public,anon,authenticated,service_role;
grant select on public.pd3_review_validations to authenticated,service_role;
grant insert(digest,passed,validator_version,message) on public.pd3_review_validations to service_role;
create policy validation_read on public.pd3_review_validations for select to authenticated using (
 exists(select 1 from public.pd3_review_requests r where r.digest=pd3_review_validations.digest)
);

create table public.pd3_review_decisions (
 digest text primary key references public.pd3_review_requests(digest),
 decision text not null check (decision in ('approved','rejected')),
 note text not null check (char_length(btrim(note)) between 1 and 2000),
 actor_id uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.pd3_review_decisions enable row level security;
revoke all on public.pd3_review_decisions from public,anon,authenticated,service_role;
grant select on public.pd3_review_decisions to authenticated,service_role;
grant insert(digest,decision,note) on public.pd3_review_decisions to authenticated;
create policy decision_read on public.pd3_review_decisions for select to authenticated using (
 exists(select 1 from public.pd3_review_requests r where r.digest=pd3_review_decisions.digest)
);
create policy decision_create on public.pd3_review_decisions for insert to authenticated with check (
 public.pd3_role() in ('reviewer','owner') and actor_id=(select auth.uid()) and
 exists(select 1 from public.pd3_review_requests r where r.digest=pd3_review_decisions.digest and r.upload_complete) and
 (decision='rejected' or exists(select 1 from public.pd3_review_validations v where v.digest=pd3_review_decisions.digest and v.passed))
);
create index pd3_decisions_actor on public.pd3_review_decisions(actor_id);

create function public.pd3_pending_validation(p_limit integer default 10)
returns setof public.pd3_review_requests language sql stable security invoker set search_path='' as $$
 select r.* from public.pd3_review_requests r where r.upload_complete and not exists(
  select 1 from public.pd3_review_validations v where v.digest=r.digest
 ) order by r.created_at limit greatest(1,least(p_limit,50))
$$;
revoke all on function public.pd3_pending_validation(integer) from public,anon,authenticated;
grant execute on function public.pd3_pending_validation(integer) to service_role;

create function public.pd3_submit_request(p_digest text,p_draft jsonb,p_images jsonb,p_canonical text,p_review_request jsonb)
returns text language plpgsql security invoker set search_path='' as $$
begin
 insert into public.pd3_review_requests(digest,draft,images,canonical,review_request)
 values(p_digest,p_draft,p_images,p_canonical,p_review_request) on conflict(digest) do nothing;
 if not exists(select 1 from public.pd3_review_requests where digest=p_digest and created_by=(select auth.uid())) then
  raise exception 'request unavailable';
 end if;
 return p_digest;
end $$;
create function public.pd3_finish_upload(p_digest text) returns text language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.pd3_review_requests where digest=p_digest and created_by=(select auth.uid())) then raise exception 'request unavailable'; end if;
 update public.pd3_review_requests set upload_complete=true where digest=p_digest and not upload_complete;
 return p_digest;
end $$;
create function public.pd3_decide(p_digest text,p_decision text,p_note text) returns text language plpgsql security invoker set search_path='' as $$
begin
 insert into public.pd3_review_decisions(digest,decision,note) values(p_digest,p_decision,p_note);
 return p_digest;
end $$;
revoke all on function public.pd3_submit_request(text,jsonb,jsonb,text,jsonb),public.pd3_finish_upload(text),public.pd3_decide(text,text,text) from public,anon;
grant execute on function public.pd3_submit_request(text,jsonb,jsonb,text,jsonb),public.pd3_finish_upload(text),public.pd3_decide(text,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pd3-review-images','pd3-review-images',false,16777216,array['image/png','image/webp']);
create policy pd3_image_read on storage.objects for select to authenticated using (
 bucket_id='pd3-review-images' and exists(
  select 1 from public.pd3_review_requests r where r.digest=split_part(name,'/',1)
  and exists(select 1 from jsonb_array_elements(r.images) x where x->>'path'=name)
 )
);
create policy pd3_image_create on storage.objects for insert to authenticated with check (
 bucket_id='pd3-review-images' and exists(
  select 1 from public.pd3_review_requests r where r.digest=split_part(name,'/',1)
  and r.created_by=(select auth.uid()) and not r.upload_complete
  and exists(select 1 from jsonb_array_elements(r.images) x where x->>'path'=name)
 )
);
-- No authenticated UPDATE/DELETE policies: images and decisions cannot be replaced.
notify pgrst,'reload schema';
commit;
