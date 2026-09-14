export type EventStatus = "pending" | "approved" | "rejected";
export type EventSourceType = "manual" | "scraped";

export interface City {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

export interface Venue {
  id: string;
  city_id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
}

export interface EventRow {
  id: string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  city_id: string;
  venue_id: string | null;
  category_id: string | null;
  price: string | null;
  source_type: EventSourceType;
  source_url: string | null;
  image_url: string | null;
  status: EventStatus;
  created_by: string | null;
  created_at: string;
}

export interface ScrapeSource {
  id: string;
  city_id: string;
  name: string;
  url: string;
  parser_type: string;
  last_run_at: string | null;
  is_active: boolean;
}

export interface Database {
  public: {
    Tables: {
      cities: { Row: City; Insert: Partial<City>; Update: Partial<City> };
      venues: { Row: Venue; Insert: Partial<Venue>; Update: Partial<Venue> };
      categories: {
        Row: Category;
        Insert: Partial<Category>;
        Update: Partial<Category>;
      };
      events: {
        Row: EventRow;
        Insert: Partial<EventRow>;
        Update: Partial<EventRow>;
      };
      scrape_sources: {
        Row: ScrapeSource;
        Insert: Partial<ScrapeSource>;
        Update: Partial<ScrapeSource>;
      };
    };
  };
}
