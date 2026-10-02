export type FlightStatus = "Confirmed" | "Changed" | "Cancelled" | "Refunded";

export const FLIGHT_STATUSES: FlightStatus[] = ["Confirmed", "Changed", "Cancelled", "Refunded"];

export interface FlightSegment {
  name: string;
  flight_no: string;
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  fare_family?: string;
  booking_class?: string;
  original_departure?: string | null;
}

export interface FlightPassenger {
  name: string;
  passenger_name: string;
  employee: string | null;
  employee_name?: string | null;
  ticket_number: string;
  previous_ticket_numbers?: string | null;
  fare: number;
  total: number;
  change_fees: number;
  extras: number;
  extras_detail?: string | null;
}

export interface FlightSourceEmail {
  message_id: string;
  subject: string;
  date: string;
  email_type: string;
}

export interface FlightBooking {
  name: string;
  booking_code: string;
  airline: string;
  status: FlightStatus;
  first_departure: string;
  qty: number;
  total_amount: number;
  currency: string;
  project: string | null;
  project_name?: string | null;
  note: string | null;
  needs_review: 0 | 1;
  modified: string;   // send back unchanged with POST /review
  review_reasons: string | string[] | null;
  route: string;
  segments: FlightSegment[];
  passengers: FlightPassenger[];
  source_emails: FlightSourceEmail[];
}

export interface FlightSyncRun {
  id?: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  stats?: Record<string, unknown>;
}

export interface FlightSyncInfo {
  last_run: FlightSyncRun | null;
  failed_emails: number;
  unmatched_emails: number;
  needs_review_count: number;
}

export interface FlightListResponse {
  bookings: FlightBooking[];
  sync: FlightSyncInfo;
  truncated?: boolean;
}

export interface FlightFilters {
  date_from: string;
  date_to: string;
  airline: string;
  project: string;
  employee: string;
  status: string;
  needs_review: boolean;
}

export const EMPTY_FILTERS: FlightFilters = {
  date_from: "",
  date_to: "",
  airline: "",
  project: "",
  employee: "",
  status: "",
  needs_review: false,
};

export interface PassengerPatch {
  ticket_number: string;
  employee?: string | null;
  total?: number;
}

export interface FlightPatch {
  project?: string;
  note?: string;
  status?: FlightStatus;
  passengers?: PassengerPatch[];
}

export interface Option {
  value: string;
  label: string;
}
