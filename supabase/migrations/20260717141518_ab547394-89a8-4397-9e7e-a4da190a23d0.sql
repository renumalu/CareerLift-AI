DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.job_applications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.resume_analyses; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.interview_sessions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.job_applications REPLICA IDENTITY FULL;
ALTER TABLE public.resume_analyses REPLICA IDENTITY FULL;
ALTER TABLE public.interview_sessions REPLICA IDENTITY FULL;