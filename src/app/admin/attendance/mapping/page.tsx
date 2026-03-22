"use client";

import { redirect } from "next/navigation";

export default function AttendanceMappingRedirectPage() {
  redirect("/admin/attendance/history");
}
