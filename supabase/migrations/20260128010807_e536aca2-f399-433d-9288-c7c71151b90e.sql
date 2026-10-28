-- Fix the relevance_score column to allow proper numeric values
ALTER TABLE public.articles 
ALTER COLUMN relevance_score TYPE numeric USING relevance_score::numeric;