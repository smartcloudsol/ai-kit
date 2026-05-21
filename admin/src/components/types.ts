export interface WordPressMedia {
  id: number;
  source_url: string;
  alt_text?: string;
  // Add other properties you might use
  title?: { rendered: string };
  caption?: { rendered: string };
  description?: { rendered: string };
  media_type?: string;
}
