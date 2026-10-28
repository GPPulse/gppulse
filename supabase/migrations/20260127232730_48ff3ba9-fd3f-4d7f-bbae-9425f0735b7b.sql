-- Create table to store PE firm sources
CREATE TABLE public.pe_firm_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  website_url TEXT NOT NULL UNIQUE,
  press_release_path TEXT,
  news_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_scraped_at TIMESTAMP WITH TIME ZONE,
  scrape_frequency_hours INTEGER DEFAULT 24,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pe_firm_sources ENABLE ROW LEVEL SECURITY;

-- Public read access for sources (needed by edge functions)
CREATE POLICY "Public can view active sources"
ON public.pe_firm_sources
FOR SELECT
USING (is_active = true);

-- Create trigger for updated_at
CREATE TRIGGER update_pe_firm_sources_updated_at
BEFORE UPDATE ON public.pe_firm_sources
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create table to store scraped content before processing
CREATE TABLE public.scraped_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID REFERENCES public.pe_firm_sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  title TEXT,
  raw_content TEXT,
  processed BOOLEAN NOT NULL DEFAULT false,
  article_id UUID REFERENCES public.articles(id),
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraped_content ENABLE ROW LEVEL SECURITY;

-- No public access to scraped content (edge functions use service role)
CREATE POLICY "No public access to scraped content"
ON public.scraped_content
FOR SELECT
USING (false);