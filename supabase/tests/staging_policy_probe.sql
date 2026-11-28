-- Trusted SQL operator, dedicated PD3 staging project only.
-- Fixture writes and role changes are rolled back in the exception subtransaction.
-- No passwords, real image bytes, usable Auth sessions or email are created.
do $probe$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); x uuid:=gen_random_uuid();
 canonical text; payload jsonb; images jsonb; proof jsonb; probe_digest text;
 denied boolean; n bigint; actor uuid; checks jsonb:='{}'; report jsonb;
begin
 begin
  canonical:=format('{"draft":{"id":"managed-probe-%s","title":"Hosted policy probe","chapter":"Synthetic","notes":"","difficulty":"easy","limit":120,"resolution":256,"regions":[{"id":1,"box":[20,80,36,96],"difficulty":"easy","changeType":"add"},{"id":2,"box":[60,80,76,96],"difficulty":"easy","changeType":"remove"},{"id":3,"box":[100,80,116,96],"difficulty":"easy","changeType":"color"},{"id":4,"box":[140,80,156,96],"difficulty":"easy","changeType":"size"},{"id":5,"box":[180,80,196,96],"difficulty":"easy","changeType":"move"}]},"images":[{"name":"original.png","sha256":"%s"},{"name":"modified.png","sha256":"%s"}]}',replace(a::text,'-',''),repeat('a',64),repeat('b',64));
  payload:=canonical::jsonb->'draft'; probe_digest:=encode(sha256(convert_to(canonical,'UTF8')),'hex');
  images:=jsonb_build_array(jsonb_build_object('name','original.png','sha256',repeat('a',64),'mime','image/png','path',probe_digest||'/0.png'),jsonb_build_object('name','modified.png','sha256',repeat('b',64),'mime','image/png','path',probe_digest||'/1.png'));
  proof:=jsonb_build_object('version',1,'contentDigest',probe_digest,'requestedAt','2026-11-28T00:00:00Z','testPlayCleared',true,'semanticReviewConfirmed',true);
  insert into auth.users(id) values(a),(b),(r),(x);
  insert into public.pd3_members(user_id,role) values(a,'editor'),(b,'editor'),(r,'reviewer');

  execute 'set local role anon'; denied:=false;
  begin perform count(*) from public.pd3_review_requests; exception when insufficient_privilege then denied:=true; end;
  checks:=checks||jsonb_build_object('anonymous_denied',denied); execute 'reset role';

  perform set_config('request.jwt.claim.sub',a::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);execute 'set local role authenticated';
  perform public.pd3_submit_request(probe_digest,payload,images,canonical,proof);
  denied:=false;begin update public.pd3_members set role='owner' where user_id=a;exception when insufficient_privilege then denied:=true;end;
  checks:=checks||jsonb_build_object('self_grant_denied',denied);
  denied:=false;begin update public.pd3_review_requests set draft='{}' where digest=probe_digest;exception when insufficient_privilege then denied:=true;end;
  checks:=checks||jsonb_build_object('metadata_immutable',denied);
  insert into storage.objects(bucket_id,name) values('pd3-review-images',probe_digest||'/0.png'),('pd3-review-images',probe_digest||'/1.png');
  perform public.pd3_finish_upload(probe_digest);
  denied:=false;begin perform public.pd3_decide(probe_digest,'approved','Synthetic editor denial');exception when insufficient_privilege then denied:=true;end;
  checks:=checks||jsonb_build_object('editor_approval_denied',denied);execute 'reset role';

  perform set_config('request.jwt.claim.sub',b::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);execute 'set local role authenticated';
  select count(*) into n from public.pd3_review_requests where digest=probe_digest;
  checks:=checks||jsonb_build_object('other_editor_hidden',n=0);
  select count(*) into n from storage.objects where bucket_id='pd3-review-images' and name like probe_digest||'/%';
  checks:=checks||jsonb_build_object('other_editor_images_hidden',n=0);execute 'reset role';

  perform set_config('request.jwt.claim.sub',x::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',x,'role','authenticated','user_metadata',jsonb_build_object('role','owner'))::text,true);execute 'set local role authenticated';
  select count(*) into n from public.pd3_review_requests where digest=probe_digest;
  checks:=checks||jsonb_build_object('unregistered_forged_claim_hidden',n=0);execute 'reset role';

  perform set_config('request.jwt.claim.sub',r::text,true);perform set_config('request.jwt.claims',jsonb_build_object('sub',r,'role','authenticated')::text,true);execute 'set local role authenticated';
  denied:=false;begin perform public.pd3_decide(probe_digest,'approved','Synthetic unchecked denial');exception when insufficient_privilege then denied:=true;end;
  checks:=checks||jsonb_build_object('unchecked_approval_denied',denied);
  denied:=false;begin insert into public.pd3_review_validations(digest,passed,validator_version,message) values(probe_digest,true,'forged','forged');exception when insufficient_privilege then denied:=true;end;
  checks:=checks||jsonb_build_object('forged_worker_receipt_denied',denied);execute 'reset role';

  execute 'set local role service_role';
  select count(*) into n from public.pd3_pending_validation(50) q where q.digest=probe_digest;
  checks:=checks||jsonb_build_object('worker_queue_visible',n=1);
  insert into public.pd3_review_validations(digest,passed,validator_version,message) values(probe_digest,true,'synthetic-rollback-probe','Synthetic metadata only; no real image validation');
  execute 'reset role';execute 'set local role authenticated';
  perform public.pd3_decide(probe_digest,'approved','Synthetic rollback-only policy probe');
  select actor_id into actor from public.pd3_review_decisions where digest=probe_digest;
  checks:=checks||jsonb_build_object('checked_reviewer_identity',actor=r);
  denied:=false;begin perform public.pd3_decide(probe_digest,'rejected','Must not replace prior decision');exception when unique_violation then denied:=true;end;
  checks:=checks||jsonb_build_object('decision_immutable',denied);execute 'reset role';
  update public.pd3_members set active=false where user_id=r;
  execute 'set local role authenticated';
  select count(*) into n from public.pd3_review_requests where digest=probe_digest;
  checks:=checks||jsonb_build_object('revoked_identity_hidden',n=0);
  select count(*) into n from storage.objects where bucket_id='pd3-review-images' and name like probe_digest||'/%';
  checks:=checks||jsonb_build_object('revoked_images_hidden',n=0);
  execute 'reset role';
  report:=jsonb_build_object('passed',not exists(select 1 from jsonb_each(checks) c where c.value is distinct from 'true'::jsonb),'checks',checks,'fixtures_rolled_back',true);
  raise exception using errcode='PZ001',message='rollback synthetic policy fixtures';
 exception
  when sqlstate 'PZ001' then null;
  when others then report:=jsonb_build_object('passed',false,'error',sqlerrm,'sqlstate',sqlstate,'fixtures_rolled_back',true);
 end;
 perform set_config('pd3.hosted_probe',report::text,false);
end $probe$;
select current_setting('pd3.hosted_probe')::jsonb as verification;
