-- A direct call to the agent number used to be attributed to whichever
-- QualEval evaluation targeted the dialed number, which put real callers'
-- calls inside evaluation sets alongside scenario runs. Direct calls now live
-- on their own Phone Evals page (server/qualeval/phoneEvaluation.js) and are
-- never tied to an evaluation, so the link column goes away.
drop index if exists production_calls_evaluation_id_idx;
alter table production_calls drop column if exists evaluation_id;
