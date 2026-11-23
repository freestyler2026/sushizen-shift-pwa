/** New-hire follow-up (HR addendum to the SOP of 11 November 2026). The
 *  procedure itself is kept by HR under Onboarding settings; the rules live on
 *  the server (app/db_onboarding_followup.py). */

export type FuMethod = { key: string; label: string; counts: boolean };
export type FuMilestone = {
  key?: string;
  label: string;
  offset_days?: number;
  offset_months?: number;
  late_after_days?: number;
  suggested_method?: string;
  focus?: string;
};
export type FuQuestion = { key?: string; label: string };
export type FuRating = { key?: string; label: string; options: string[] };
export type FuTemplate = {
  title: string;
  effective_from?: string;
  methods: FuMethod[];
  milestones: FuMilestone[];
  questions: FuQuestion[];
  ratings: FuRating[];
  pic?: { label: string; due_offset_days: number; competency_areas: string[]; questions: FuQuestion[] } | null;
  minimums: { phone: number; face_to_face: number; pic: number };
  rules: string[];
};

export type FuAction = { action: string; owner: string; due: string; verification: string };
export type FuContact = {
  id: string;
  milestone_key: string;
  actual_date: string;
  actual_time: string;
  method: string;
  status: "completed" | "attempted" | "rescheduled";
  answers: Record<string, string>;
  ratings: Record<string, string>;
  competency: { area: string; result: string; evidence: string }[];
  actions: FuAction[];
  pic_name: string;
  next_contact: string | null;
  escalated_to: string;
  evidence_ref: string;
  employee_confirmed: boolean;
  recorded_by: string;
  recorded_at: string | null;
  updated_by: string;
  updated_at: string | null;
};

export type FuScheduleRow = {
  key: string;
  label: string;
  focus: string;
  suggested_method: string;
  planned_date: string;
  deadline: string;
  state: "done" | "late" | "due" | "overdue" | "upcoming";
  completed: FuContact | null;
  attempts: FuContact[];
  records: FuContact[];
};

export type FuAuditLine = { done: number; required: number; met: boolean };
export type FuPlan = {
  started: boolean;
  can_start?: boolean;
  reason?: string;
  staff_name: string;
  start_date?: string;
  template_version?: number;
  latest_version?: number;
  template?: FuTemplate;
  hr_owner?: string;
  direct_pic?: string;
  training_buddy?: string;
  schedule?: FuScheduleRow[];
  audit?: {
    checkins: FuAuditLine;
    phone: FuAuditLine;
    face_to_face: FuAuditLine;
    pic: FuAuditLine;
    actions: FuAuditLine;
    late_or_missed: string[];
  };
  review?: {
    progress?: string;
    development_plan?: string;
    deficiencies?: string;
    written_by?: string;
    written_at?: string | null;
    hr_manager_review_by?: string;
    hr_manager_review_at?: string | null;
    management_approval_by?: string;
    management_approval_at?: string | null;
  };
};

export type FuSummary = {
  staff_name: string;
  overdue: string[];
  due_today: string[];
  next: { label: string; date: string } | null;
  done: number;
  total: number;
};

export const STATE_LABEL: Record<FuScheduleRow["state"], string> = {
  done: "Done",
  late: "Done late",
  due: "Due",
  overdue: "Overdue",
  upcoming: "Upcoming",
};
