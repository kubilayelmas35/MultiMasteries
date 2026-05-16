import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

function normCode(code: unknown) {
  return String(code ?? "").trim().toUpperCase();
}
function normPin(pin: unknown) {
  return String(pin ?? "").trim();
}
function randomToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toSchoolDayOfWeek(d: Date) {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}
function startOfWeekMonday(date: Date) {
  const d = new Date(date);
  const dow = toSchoolDayOfWeek(d);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dow - 1));
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function characterStageFromXp(xp: number) {
  if (xp < 50) return 0;
  if (xp < 150) return 1;
  if (xp < 300) return 2;
  if (xp < 500) return 3;
  return 4;
}

function characterMeta(stage: number) {
  const names = ["Çırak", "Kalfa", "Usta adayı", "Ders Ustası", "Büyük Usta"];
  const emojis = ["📘", "📗", "🎯", "🏆", "👑"];
  const s = Math.min(4, Math.max(0, stage));
  return { stage: s, name: names[s], emoji: emojis[s] };
}

function trackLabel(track: string, grade: number) {
  if (grade <= 10) return "Lise 9–10";
  const m: Record<string, string> = {
    sayisal: "Sayısal",
    sozel: "Sözel",
    esit: "Eşit ağırlık",
    dil: "Dil",
    tyt: "TYT",
    lgs: "LGS",
  };
  return m[String(track || "").toLowerCase()] || track || "—";
}

async function buildWeekOverview(
  supabase: SupabaseClient,
  studentId: string,
  itemRows: { id: string; topic_snapshot?: string; subjects?: { title?: string } | null }[],
  monday: Date,
) {
  const { data: stu } = await supabase
    .from("students")
    .select("id, title, grade, track, xp, character_stage, avatar_url")
    .eq("id", studentId)
    .maybeSingle();
  const xp = Number(stu?.xp) || 0;
  const character = characterMeta(Number(stu?.character_stage) || characterStageFromXp(xp));
  const itemIds = itemRows.map((r) => String(r.id));
  const sun = new Date(monday);
  sun.setDate(sun.getDate() + 6);
  const from = isoDate(monday);
  const to = isoDate(sun);
  let logs: Record<string, unknown>[] = [];
  if (itemIds.length) {
    const { data, error } = await supabase
      .from("study_logs")
      .select("*")
      .eq("student_id", studentId)
      .in("plan_item_id", itemIds)
      .gte("work_date", from)
      .lte("work_date", to);
    if (error) throw error;
    logs = data || [];
  }
  const logByItem: Record<string, Record<string, unknown>> = {};
  for (const lg of logs) logByItem[String(lg.plan_item_id)] = lg;

  let completed = 0;
  const moodTopics: Record<string, { subject: string; topic: string; note: string }[]> = {
    iyi: [],
    orta: [],
    kotu: [],
  };
  for (const it of itemRows) {
    const lg = logByItem[String(it.id)];
    const subj = (it.subjects as { title?: string } | null)?.title || "Ders";
    const topic = String(it.topic_snapshot || "");
    if (!lg) continue;
    if (lg.kanban_status === "done") completed++;
    const mood = String(lg.mood || "");
    if (mood === "iyi" || mood === "orta" || mood === "kotu") {
      moodTopics[mood].push({
        subject: subj,
        topic,
        note: String(lg.student_note || ""),
      });
    }
  }
  const total = itemRows.length;
  const { count: donePages, error: countErr } = await supabase
    .from("study_logs")
    .select("*", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("kanban_status", "done");
  if (countErr) throw countErr;
  const bookPages = donePages ?? 0;
  return {
    student: {
      id: stu?.id,
      title: stu?.title,
      grade: stu?.grade,
      track: stu?.track,
      trackLabel: trackLabel(String(stu?.track || ""), Number(stu?.grade)),
      xp,
      character,
      bookPages,
      avatarUrl: stu?.avatar_url || "",
    },
    stats: {
      totalItems: total,
      completed,
      pending: Math.max(0, total - completed),
      moodGood: moodTopics.iyi.length,
      moodMid: moodTopics.orta.length,
      moodBad: moodTopics.kotu.length,
    },
    moodTopics,
    logByItem,
  };
}

function sb(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function resolveStudentSession(supabase: SupabaseClient, sessionToken: string) {
  if (!sessionToken) throw new Error("Öğrenci oturumu yok");
  const { data: row, error } = await supabase
    .from("student_sessions")
    .select("id, student_id, expires_at")
    .eq("session_token", sessionToken)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Oturum geçersiz");
  if (new Date(row.expires_at) < new Date()) {
    await supabase.from("student_sessions").delete().eq("id", row.id);
    throw new Error("Oturum süresi doldu");
  }
  return row.student_id as string;
}

async function resolveStaffSession(supabase: SupabaseClient, sessionToken: string) {
  if (!sessionToken) throw new Error("Öğretmen oturumu yok");
  const { data: row, error } = await supabase
    .from("staff_sessions")
    .select("id, staff_id, expires_at")
    .eq("session_token", sessionToken)
    .maybeSingle();
  if (error) throw error;
  if (!row) throw new Error("Oturum geçersiz");
  if (new Date(row.expires_at) < new Date()) {
    await supabase.from("staff_sessions").delete().eq("id", row.id);
    throw new Error("Oturum süresi doldu");
  }
  return row.staff_id as string;
}

async function createStudentSession(supabase: SupabaseClient, studentId: string) {
  const sessionToken = randomToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MS);
  const { error } = await supabase.from("student_sessions").insert({
    session_token: sessionToken,
    student_id: studentId,
    expires_at: expiresAt.toISOString(),
    created_at: now.toISOString(),
  });
  if (error) throw error;
  return sessionToken;
}

async function assertStaffOwnsStudent(
  supabase: SupabaseClient,
  staffId: string,
  studentId: string,
) {
  const { data, error } = await supabase
    .from("teacher_students")
    .select("id")
    .eq("staff_id", staffId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .limit(1);
  if (error) throw error;
  if (!data?.length) throw new Error("Bu öğrenciye erişim yok");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return err("POST gerekli", 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err("Geçersiz JSON");
  }

  const action = String(body.action || "");
  const supabase = sb();

  try {
    switch (action) {
      case "studentlogin": {
        const lc = normCode(body.loginCode);
        const p = normPin(body.pin);
        if (!lc || !p) throw new Error("Kod ve PIN gerekli");
        const { data: st, error } = await supabase
          .from("students")
          .select("id, title")
          .eq("login_code", lc)
          .eq("pin", p)
          .eq("active", true)
          .maybeSingle();
        if (error) throw error;
        if (!st) throw new Error("Kod veya PIN hatalı");
        const sessionToken = await createStudentSession(supabase, st.id);
        return json({
          sessionToken,
          studentId: st.id,
          displayName: st.title || "Öğrenci",
        });
      }
      case "studentregister": {
        const title = String(body.title || "").trim();
        const lc = normCode(body.loginCode);
        const p = normPin(body.pin);
        const grade = Number(body.grade);
        const schoolYear = String(body.schoolYear || "").trim();
        if (title.length < 2) throw new Error("Ad / soyad en az 2 karakter");
        if (!lc || lc.length < 4) throw new Error("Giriş kodu en az 4 karakter");
        if (!/^[A-Z0-9]+$/.test(lc)) throw new Error("Giriş kodu sadece harf ve rakam");
        if (!p || p.length < 4) throw new Error("PIN en az 4 karakter");
        if (p.length > 32) throw new Error("PIN çok uzun");
        if (!Number.isFinite(grade) || grade < 9 || grade > 12) {
          throw new Error("Kayıt için sınıf 9–12 arası olmalı");
        }
        let track = String(body.track || "").trim().toLowerCase();
        if (grade <= 10) track = "lgs";
        else {
          const ok = ["sayisal", "sozel", "esit", "dil", "tyt"];
          if (!ok.includes(track)) throw new Error("11–12. sınıf için geçerli bölüm seçin");
        }
        const { data: dup } = await supabase.from("students").select("id").eq("login_code", lc).limit(1);
        if (dup?.length) throw new Error("Bu giriş kodu kullanılıyor; başka kod seçin");
        const { data: st, error } = await supabase
          .from("students")
          .insert({
            title,
            login_code: lc,
            pin: p,
            grade,
            track,
            school_year: schoolYear || "",
            active: true,
          })
          .select("id, title")
          .single();
        if (error) throw error;
        const sessionToken = await createStudentSession(supabase, st.id);
        return json({
          sessionToken,
          studentId: st.id,
          displayName: st.title || "Öğrenci",
        });
      }
      case "studentlogout": {
        const sessionToken = String(body.sessionToken || "");
        if (sessionToken) {
          await supabase.from("student_sessions").delete().eq("session_token", sessionToken);
        }
        return json({ ok: true });
      }
      case "studenttoday": {
        const studentId = await resolveStudentSession(supabase, String(body.sessionToken || ""));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const monday = startOfWeekMonday(today);
        const monStr = isoDate(monday);
        const { data: plans } = await supabase
          .from("weekly_plans")
          .select("id, title, status, week_start")
          .eq("student_id", studentId)
          .eq("status", "published")
          .eq("week_start", monStr)
          .limit(1);
        const plan = plans?.[0] || null;
        const dow = toSchoolDayOfWeek(new Date());
        if (!plan) {
          return json({ plan: null, todayItems: [], dow });
        }
        const { data: items, error } = await supabase
          .from("plan_items")
          .select(
            "id, day_of_week, slot_order, duration_minutes, topic_snapshot, teacher_note, has_test, subject_id, subjects ( id, title )",
          )
          .eq("weekly_plan_id", plan.id)
          .eq("day_of_week", dow)
          .order("slot_order", { ascending: true });
        if (error) throw error;
        const mapped = (items || []).map((it: Record<string, unknown>) => {
          const sub = it.subjects as { id: string; title: string } | null | undefined;
          return {
            _id: it.id,
            dayOfWeek: it.day_of_week,
            slotOrder: it.slot_order,
            durationMinutes: it.duration_minutes,
            topicSnapshot: it.topic_snapshot,
            teacherNote: it.teacher_note,
            hasTest: it.has_test,
            subject: sub ? { _id: sub.id, title: sub.title } : null,
          };
        });
        return json({
          plan: {
            _id: plan.id,
            title: plan.title,
            status: plan.status,
            weekStart: plan.week_start,
          },
          todayItems: mapped,
          dow,
        });
      }
      case "studentweek": {
        const studentId = await resolveStudentSession(supabase, String(body.sessionToken || ""));
        const weekStart = body.weekStartIso
          ? new Date(String(body.weekStartIso))
          : new Date();
        weekStart.setHours(0, 0, 0, 0);
        const monday = startOfWeekMonday(weekStart);
        const monStr = isoDate(monday);
        const { data: plans } = await supabase
          .from("weekly_plans")
          .select("id, title, status, week_start")
          .eq("student_id", studentId)
          .eq("status", "published")
          .eq("week_start", monStr)
          .limit(1);
        const plan = plans?.[0] || null;
        if (!plan) return json({ plan: null, items: [], dow: toSchoolDayOfWeek(new Date()) });
        const { data: items, error } = await supabase
          .from("plan_items")
          .select(
            "id, day_of_week, slot_order, duration_minutes, topic_snapshot, topic_ids_snapshot, teacher_note, importance, has_test, subject_id, subjects ( id, title, color )",
          )
          .eq("weekly_plan_id", plan.id)
          .order("day_of_week", { ascending: true })
          .order("slot_order", { ascending: true });
        if (error) throw error;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const wd = isoDate(today);
        const itemIds = (items || []).map((it: { id: string }) => it.id);
        let logsByItem: Record<string, Record<string, unknown>> = {};
        if (itemIds.length) {
          const { data: logs } = await supabase
            .from("study_logs")
            .select("*")
            .eq("student_id", studentId)
            .eq("work_date", wd)
            .in("plan_item_id", itemIds);
          for (const lg of logs || []) {
            logsByItem[String(lg.plan_item_id)] = lg;
          }
        }
        const { data: stu } = await supabase.from("students").select("xp, character_stage, title").eq("id", studentId)
          .maybeSingle();
        const xp = Number(stu?.xp) || 0;
        const mapped = (items || []).map((it: Record<string, unknown>) => {
          const sub = it.subjects as { id: string; title: string; color: string } | null | undefined;
          const log = logsByItem[String(it.id)];
          return {
            _id: it.id,
            dayOfWeek: it.day_of_week,
            slotOrder: it.slot_order,
            durationMinutes: it.duration_minutes,
            topicSnapshot: it.topic_snapshot,
            topicIdsSnapshot: it.topic_ids_snapshot,
            teacherNote: it.teacher_note,
            importance: it.importance,
            hasTest: it.has_test,
            subject: sub ? { _id: sub.id, title: sub.title, color: sub.color } : null,
            log: log
              ? {
                kanbanStatus: log.kanban_status,
                mood: log.mood,
                studentNote: log.student_note,
                correct: log.correct,
                wrong: log.wrong,
                blank: log.blank,
              }
              : null,
          };
        });
        return json({
          plan: {
            _id: plan.id,
            title: plan.title,
            status: plan.status,
            weekStart: plan.week_start,
          },
          items: mapped,
          dow: toSchoolDayOfWeek(new Date()),
          progress: {
            xp,
            character: characterMeta(Number(stu?.character_stage) || characterStageFromXp(xp)),
          },
        });
      }
      case "studentsavelog": {
        const studentId = await resolveStudentSession(supabase, String(body.sessionToken || ""));
        const workDate = body.workDateIso
          ? new Date(String(body.workDateIso))
          : new Date();
        workDate.setHours(0, 0, 0, 0);
        const wd = isoDate(workDate);
        const planItemId = String(body.planItemId || "");
        const { data: item, error: e1 } = await supabase
          .from("plan_items")
          .select("id, weekly_plan_id")
          .eq("id", planItemId)
          .maybeSingle();
        if (e1) throw e1;
        if (!item) throw new Error("Plan kalemi yok");
        const { data: plan, error: e2 } = await supabase
          .from("weekly_plans")
          .select("id, student_id")
          .eq("id", item.weekly_plan_id)
          .maybeSingle();
        if (e2) throw e2;
        if (!plan || plan.student_id !== studentId) throw new Error("Bu kalem size ait değil");
        const row = {
          plan_item_id: planItemId,
          student_id: studentId,
          work_date: wd,
          kanban_status: body.kanbanStatus ?? null,
          mood: String(body.mood || ""),
          student_note: String(body.studentNote || ""),
          correct: body.correct != null ? Number(body.correct) : 0,
          wrong: body.wrong != null ? Number(body.wrong) : 0,
          blank: body.blank != null ? Number(body.blank) : 0,
          test_duration_minutes: body.testDurationMinutes != null ? Number(body.testDurationMinutes) : 0,
          actual_minutes: body.actualMinutes != null ? Number(body.actualMinutes) : 0,
          updated_at: new Date().toISOString(),
        };
        const { data: ex } = await supabase
          .from("study_logs")
          .select("id")
          .eq("plan_item_id", planItemId)
          .eq("student_id", studentId)
          .eq("work_date", wd)
          .maybeSingle();
        const wasDone = ex?.id
          ? (await supabase.from("study_logs").select("kanban_status").eq("id", ex.id).maybeSingle()).data
              ?.kanban_status === "done"
          : false;
        if (ex?.id) {
          const { error } = await supabase.from("study_logs").update(row).eq("id", ex.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("study_logs").insert(row);
          if (error) throw error;
        }
        const nowDone = row.kanban_status === "done";
        let xpGain = 0;
        if (nowDone && !wasDone) {
          xpGain = 10;
          if (row.correct > 0 || row.wrong > 0 || row.blank > 0) xpGain += 5;
          const { data: stu } = await supabase.from("students").select("xp").eq("id", studentId).maybeSingle();
          const newXp = (Number(stu?.xp) || 0) + xpGain;
          const stage = characterStageFromXp(newXp);
          await supabase.from("students").update({ xp: newXp, character_stage: stage }).eq("id", studentId);
        }
        const { data: stuAfter } = await supabase.from("students").select("xp, character_stage").eq("id", studentId)
          .maybeSingle();
        const meta = characterMeta(Number(stuAfter?.character_stage) || 0);
        return json({
          ok: true,
          xpGain,
          xp: Number(stuAfter?.xp) || 0,
          character: meta,
        });
      }
      case "studentlogget": {
        const studentId = await resolveStudentSession(supabase, String(body.sessionToken || ""));
        const planItemId = String(body.planItemId || "");
        const workDate = body.workDateIso ? new Date(String(body.workDateIso)) : new Date();
        workDate.setHours(0, 0, 0, 0);
        const wd = isoDate(workDate);
        const { data: log, error } = await supabase
          .from("study_logs")
          .select("*")
          .eq("plan_item_id", planItemId)
          .eq("student_id", studentId)
          .eq("work_date", wd)
          .maybeSingle();
        if (error) throw error;
        return json({ log: log || null });
      }
      case "studentprogress": {
        const studentId = await resolveStudentSession(supabase, String(body.sessionToken || ""));
        const { data: stu, error } = await supabase.from("students").select("xp, character_stage, title, avatar_url").eq("id", studentId)
          .maybeSingle();
        if (error) throw error;
        const xp = Number(stu?.xp) || 0;
        const stage = Number(stu?.character_stage) || characterStageFromXp(xp);
        const meta = characterMeta(stage);
        const nextThreshold = [50, 150, 300, 500, 9999][stage] ?? 9999;
        const prevThreshold = [0, 50, 150, 300, 500][stage] ?? 0;
        const pct = Math.min(100, Math.round(((xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100));
        const { count: bp, error: cErr } = await supabase
          .from("study_logs")
          .select("*", { count: "exact", head: true })
          .eq("student_id", studentId)
          .eq("kanban_status", "done");
        if (cErr) throw cErr;
        const bookPages = bp ?? 0;
        let bookGoal = 25;
        while (bookGoal <= bookPages) bookGoal += 25;
        const bookFillPct = Math.min(100, Math.round((bookPages / bookGoal) * 100));
        return json({
          xp,
          character: meta,
          progressPercent: pct,
          nextXp: nextThreshold,
          displayName: stu?.title || "Öğrenci",
          bookPages,
          bookGoal,
          bookFillPct,
          avatarUrl: stu?.avatar_url || "",
        });
      }
      case "stafflogin": {
        const lc = normCode(body.loginCode);
        const p = normPin(body.pin);
        if (!lc || !p) throw new Error("Kod ve PIN gerekli");
        const { data: st, error } = await supabase
          .from("staff")
          .select("id, title, avatar_url")
          .eq("login_code", lc)
          .eq("pin", p)
          .eq("active", true)
          .maybeSingle();
        if (error) throw error;
        if (!st) throw new Error("Kod veya PIN hatalı");
        const sessionToken = randomToken();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + SESSION_MS);
        const { error: e2 } = await supabase.from("staff_sessions").insert({
          session_token: sessionToken,
          staff_id: st.id,
          expires_at: expiresAt.toISOString(),
          created_at: now.toISOString(),
        });
        if (e2) throw e2;
        return json({
          sessionToken,
          staffId: st.id,
          displayName: st.title || "Öğretmen",
          avatarUrl: st.avatar_url || "",
        });
      }
      case "stafflogout": {
        const sessionToken = String(body.staffToken || "");
        if (sessionToken) {
          await supabase.from("staff_sessions").delete().eq("session_token", sessionToken);
        }
        return json({ ok: true });
      }
      case "staffstudents": {
        const staffId = await resolveStaffSession(supabase, String(body.staffToken || ""));
        const { data: rows, error } = await supabase
          .from("teacher_students")
          .select("id, student_id, students ( id, title )")
          .eq("staff_id", staffId)
          .eq("status", "active");
        if (error) throw error;
        const out = (rows || []).map((r: Record<string, unknown>) => {
          const stu = r.students as { id: string; title: string } | null;
          return {
            linkId: r.id,
            studentId: r.student_id,
            label: stu?.title || String(r.student_id),
          };
        });
        return json(out);
      }
      case "staffgetstudent": {
        const staffId = await resolveStaffSession(supabase, String(body.staffToken || ""));
        const studentId = String(body.studentId || "");
        await assertStaffOwnsStudent(supabase, staffId, studentId);
        const { data: st, error } = await supabase.from("students").select("*").eq("id", studentId).maybeSingle();
        if (error) throw error;
        return json(st);
      }
      case "staffsubjects": {
        await resolveStaffSession(supabase, String(body.staffToken || ""));
        const { data: rows, error } = await supabase.from("subjects").select("*").order("sort_order", {
          ascending: true,
        });
        if (error) throw error;
        const mapped = (rows || []).map((s: Record<string, unknown>) => ({
          _id: s.id,
          title: s.title,
          code: s.code,
          color: s.color,
          sortOrder: s.sort_order,
        }));
        return json(mapped);
      }
      case "staffcurriculumsubjects": {
        await resolveStaffSession(supabase, String(body.staffToken || ""));
        const grade = Number(body.grade);
        if (!Number.isFinite(grade) || grade < 9 || grade > 12) {
          throw new Error("Müfredat için sınıf 9–12 seçin");
        }
        let topicTrack = String(body.track || "").trim().toLowerCase();
        if (grade <= 10) topicTrack = "lgs";
        else if (!topicTrack) throw new Error("11–12 için bölüm seçin");
        const { data: topicRows, error: e1 } = await supabase
          .from("topics")
          .select("subject_id, subjects ( id, title, color, sort_order )")
          .eq("grade", grade)
          .in("track", [topicTrack, "hepsi"]);
        if (e1) throw e1;
        const map = new Map<string, Record<string, unknown>>();
        for (const t of topicRows || []) {
          const sub = t.subjects as Record<string, unknown> | null;
          if (sub?.id) map.set(String(sub.id), sub);
        }
        const out = Array.from(map.values())
          .map((s) => ({
            _id: s.id,
            title: s.title,
            color: s.color,
            sortOrder: s.sort_order,
          }))
          .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0));
        return json(out);
      }
      case "stafftopics": {
        const staffId = await resolveStaffSession(supabase, String(body.staffToken || ""));
        const studentId = String(body.studentId || "");
        const subjectId = String(body.subjectId || "");
        await assertStaffOwnsStudent(supabase, staffId, studentId);
        let grade = body.grade != null ? Number(body.grade) : NaN;
        let topicTrack = String(body.track || "").trim().toLowerCase();
        if (!Number.isFinite(grade) || grade < 9 || grade > 12) {
          const { data: stu, error: e1 } = await supabase.from("students").select("grade, track").eq("id", studentId)
            .maybeSingle();
          if (e1) throw e1;
          if (!stu) throw new Error("Öğrenci yok");
          grade = Number(stu.grade);
          topicTrack = grade <= 10 ? "lgs" : String(stu.track || "").trim().toLowerCase();
        } else if (grade <= 10) {
          topicTrack = "lgs";
        } else if (!topicTrack) {
          throw new Error("11–12 müfredatı için bölüm seçin");
        }
        const { data: a, error: e2 } = await supabase
          .from("topics")
          .select("*")
          .eq("grade", grade)
          .eq("subject_id", subjectId)
          .eq("track", topicTrack)
          .order("sort_order", { ascending: true });
        if (e2) throw e2;
        const { data: b, error: e3 } = await supabase
          .from("topics")
          .select("*")
          .eq("grade", grade)
          .eq("subject_id", subjectId)
          .eq("track", "hepsi")
          .order("sort_order", { ascending: true });
        if (e3) throw e3;
        const merged = [...(a || []), ...(b || [])].sort(
          (x, y) => Number(x.sort_order || 0) - Number(y.sort_order || 0),
        );
        const mapped = merged.map((t: Record<string, unknown>) => ({
          _id: t.id,
          title: t.title,
          grade: t.grade,
          track: t.track,
          sortOrder: t.sort_order,
          defaultMinutes: t.default_minutes,
          subject: subjectId,
        }));
        return json(mapped);
      }
      case "staffweeklyget": {
        const staffId = await resolveStaffSession(supabase, String(body.staffToken || ""));
        const studentId = String(body.studentId || "");
        await assertStaffOwnsStudent(supabase, staffId, studentId);
        const weekStart = new Date(String(body.weekStartIso || ""));
        weekStart.setHours(0, 0, 0, 0);
        const ws = isoDate(weekStart);
        const { data: plan, error: e1 } = await supabase
          .from("weekly_plans")
          .select("*")
          .eq("staff_id", staffId)
          .eq("student_id", studentId)
          .eq("week_start", ws)
          .maybeSingle();
        if (e1) throw e1;
        const monday = startOfWeekMonday(weekStart);
        if (!plan) {
          const overview = await buildWeekOverview(supabase, studentId, [], monday);
          return json({ plan: null, items: [], overview });
        }
        const { data: items, error: e2 } = await supabase
          .from("plan_items")
          .select(
            "id, day_of_week, slot_order, start_time, duration_minutes, topic_snapshot, topic_ids_snapshot, teacher_note, importance, has_test, subject_id, subjects ( id, title, color )",
          )
          .eq("weekly_plan_id", plan.id)
          .order("day_of_week", { ascending: true })
          .order("slot_order", { ascending: true });
        if (e2) throw e2;
        const overview = await buildWeekOverview(supabase, studentId, items || [], monday);
        const mapped = (items || []).map((it: Record<string, unknown>) => {
          const sub = it.subjects as { id: string; title: string } | null | undefined;
          const lg = overview.logByItem[String(it.id)];
          return {
            _id: it.id,
            dayOfWeek: it.day_of_week,
            slotOrder: it.slot_order,
            startTime: it.start_time,
            durationMinutes: it.duration_minutes,
            topicSnapshot: it.topic_snapshot,
            topicIdsSnapshot: it.topic_ids_snapshot,
            teacherNote: it.teacher_note,
            importance: it.importance,
            hasTest: it.has_test,
            subject: sub ? { _id: sub.id, title: sub.title, color: sub.color } : null,
            studentLog: lg
              ? {
                kanbanStatus: lg.kanban_status,
                mood: lg.mood,
                studentNote: lg.student_note,
                correct: lg.correct,
                wrong: lg.wrong,
                blank: lg.blank,
              }
              : null,
          };
        });
        const { logByItem: _omit, ...overviewPublic } = overview;
        return json({
          plan: {
            _id: plan.id,
            title: plan.title,
            status: plan.status,
            weekStart: plan.week_start,
          },
          items: mapped,
          overview: overviewPublic,
        });
      }
      case "staffweeklysave": {
        const staffId = await resolveStaffSession(supabase, String(body.staffToken || ""));
        const studentId = String(body.studentId || "");
        await assertStaffOwnsStudent(supabase, staffId, studentId);
        const weekStart = new Date(String(body.weekStartIso || ""));
        weekStart.setHours(0, 0, 0, 0);
        const ws = isoDate(weekStart);
        const title = body.title != null ? String(body.title) : "Haftalık plan";
        const status = body.status != null ? String(body.status) : "draft";
        const now = new Date().toISOString();
        let { data: plan } = await supabase
          .from("weekly_plans")
          .select("*")
          .eq("staff_id", staffId)
          .eq("student_id", studentId)
          .eq("week_start", ws)
          .maybeSingle();
        if (!plan) {
          const { data: ins, error } = await supabase
            .from("weekly_plans")
            .insert({
              staff_id: staffId,
              student_id: studentId,
              week_start: ws,
              title,
              status,
              updated_at: now,
            })
            .select("*")
            .single();
          if (error) throw error;
          plan = ins;
        } else {
          const { data: upd, error } = await supabase
            .from("weekly_plans")
            .update({ title, status, updated_at: now })
            .eq("id", plan.id)
            .select("*")
            .single();
          if (error) throw error;
          plan = upd;
        }
        await supabase.from("plan_items").delete().eq("weekly_plan_id", plan!.id);
        const items = Array.isArray(body.items) ? body.items : [];
        const saved: Record<string, unknown>[] = [];
        for (const it of items) {
          const row = it as Record<string, unknown>;
          const { data: rowIns, error } = await supabase
            .from("plan_items")
            .insert({
              weekly_plan_id: plan!.id,
              day_of_week: Number(row.dayOfWeek || 1),
              slot_order: Number(row.slotOrder || 1),
              start_time: String(row.startTime || ""),
              duration_minutes: Number(row.durationMinutes || 45),
              subject_id: String(row.subjectId || ""),
              topic_snapshot: String(row.topicSnapshot || ""),
              topic_ids_snapshot: String(row.topicIdsSnapshot || ""),
              teacher_note: String(row.teacherNote || ""),
              importance: String(row.importance || "normal"),
              has_test: !!row.hasTest,
            })
            .select("*")
            .single();
          if (error) throw error;
          saved.push(rowIns);
        }
        return json({
          plan: {
            _id: plan!.id,
            title: plan!.title,
            status: plan!.status,
            weekStart: plan!.week_start,
          },
          items: saved,
        });
      }
      case "staffplanhistory": {
        const staffId = await resolveStaffSession(supabase, String(body.staffToken || ""));
        const studentId = String(body.studentId || "");
        await assertStaffOwnsStudent(supabase, staffId, studentId);
        const { data: rows, error } = await supabase
          .from("weekly_plans")
          .select("week_start, title, status, updated_at")
          .eq("staff_id", staffId)
          .eq("student_id", studentId)
          .order("week_start", { ascending: false })
          .limit(52);
        if (error) throw error;
        return json(rows || []);
      }
      case "staffstudentanalytics": {
        const staffId = await resolveStaffSession(supabase, String(body.staffToken || ""));
        const studentId = String(body.studentId || "");
        await assertStaffOwnsStudent(supabase, staffId, studentId);
        const { count: bookPages, error: e1 } = await supabase
          .from("study_logs")
          .select("*", { count: "exact", head: true })
          .eq("student_id", studentId)
          .eq("kanban_status", "done");
        if (e1) throw e1;
        const { data: logs, error: e2 } = await supabase
          .from("study_logs")
          .select("mood, kanban_status")
          .eq("student_id", studentId);
        if (e2) throw e2;
        let iyi = 0, orta = 0, kotu = 0, doneTotal = 0;
        for (const l of logs || []) {
          if (l.kanban_status === "done") doneTotal++;
          const m = String(l.mood || "");
          if (m === "iyi") iyi++;
          else if (m === "orta") orta++;
          else if (m === "kotu") kotu++;
        }
        const rated = iyi + orta + kotu;
        const successRatePercent = rated ? Math.round((iyi / rated) * 100) : 0;
        const { count: planCount, error: e3 } = await supabase
          .from("weekly_plans")
          .select("*", { count: "exact", head: true })
          .eq("staff_id", staffId)
          .eq("student_id", studentId);
        if (e3) throw e3;
        return json({
          bookPages: bookPages ?? 0,
          lessonsCompleted: doneTotal,
          moodIyi: iyi,
          moodOrta: orta,
          moodKotu: kotu,
          ratedLessons: rated,
          successRatePercent,
          plansCount: planCount ?? 0,
        });
      }
      case "staffgetprofile": {
        const staffId = await resolveStaffSession(supabase, String(body.staffToken || ""));
        const { data, error } = await supabase
          .from("staff")
          .select("title, login_code, avatar_url")
          .eq("id", staffId)
          .maybeSingle();
        if (error) throw error;
        return json({
          title: data?.title || "",
          loginCode: data?.login_code || "",
          avatarUrl: data?.avatar_url || "",
        });
      }
      case "staffupdateprofile": {
        const staffId = await resolveStaffSession(supabase, String(body.staffToken || ""));
        const currentPin = normPin(body.currentPin || "");
        const { data: row, error: verr } = await supabase.from("staff").select("pin").eq("id", staffId).maybeSingle();
        if (verr) throw verr;
        const updates: Record<string, unknown> = {};
        if (body.title != null && String(body.title).trim().length) {
          const t = String(body.title).trim();
          if (t.length < 2) throw new Error("Ad / unvan en az 2 karakter");
          updates.title = t;
        }
        if (body.pin != null && String(body.pin).length) {
          if (!currentPin || currentPin !== row?.pin) throw new Error("Mevcut PIN gerekli ve doğru olmalı");
          const p = normPin(body.pin);
          if (p.length < 4) throw new Error("Yeni PIN en az 4 karakter");
          if (p.length > 32) throw new Error("PIN çok uzun");
          updates.pin = p;
        }
        if (body.loginCode != null && String(body.loginCode).trim().length) {
          if (!currentPin || currentPin !== row?.pin) throw new Error("Kodu değiştirmek için mevcut PIN gerekli");
          const lc = normCode(body.loginCode);
          if (lc.length < 4) throw new Error("Kod en az 4 karakter");
          if (!/^[A-Z0-9]+$/.test(lc)) throw new Error("Kod sadece harf ve rakam");
          const { data: dup } = await supabase.from("staff").select("id").eq("login_code", lc).neq("id", staffId).limit(1);
          if (dup?.length) throw new Error("Bu kod kullanılıyor");
          updates.login_code = lc;
        }
        if (body.avatarUrl !== undefined) {
          const u = String(body.avatarUrl || "");
          if (u.length > 350000) throw new Error("Fotoğraf çok büyük; daha küçük görsel seçin");
          updates.avatar_url = u;
        }
        if (Object.keys(updates).length === 0) return json({ ok: true });
        const { error } = await supabase.from("staff").update(updates).eq("id", staffId);
        if (error) throw error;
        return json({ ok: true });
      }
      case "studentgetprofile": {
        const studentId = await resolveStudentSession(supabase, String(body.sessionToken || ""));
        const { data, error } = await supabase
          .from("students")
          .select("title, login_code, grade, track, avatar_url")
          .eq("id", studentId)
          .maybeSingle();
        if (error) throw error;
        const grade = Number(data?.grade) || 9;
        return json({
          title: data?.title || "",
          loginCode: data?.login_code || "",
          grade,
          track: data?.track || "",
          trackLabel: trackLabel(String(data?.track || ""), grade),
          avatarUrl: data?.avatar_url || "",
        });
      }
      case "studentupdateprofile": {
        const studentId = await resolveStudentSession(supabase, String(body.sessionToken || ""));
        const currentPin = normPin(body.currentPin || "");
        const { data: row, error: verr } = await supabase.from("students").select("pin").eq("id", studentId).maybeSingle();
        if (verr) throw verr;
        const updates: Record<string, unknown> = {};
        if (body.title != null && String(body.title).trim().length) {
          const t = String(body.title).trim();
          if (t.length < 2) throw new Error("Ad soyad en az 2 karakter");
          updates.title = t;
        }
        if (body.pin != null && String(body.pin).length) {
          if (!currentPin || currentPin !== row?.pin) throw new Error("Mevcut PIN gerekli ve doğru olmalı");
          const p = normPin(body.pin);
          if (p.length < 4) throw new Error("Yeni PIN en az 4 karakter");
          if (p.length > 32) throw new Error("PIN çok uzun");
          updates.pin = p;
        }
        if (body.loginCode != null && String(body.loginCode).trim().length) {
          if (!currentPin || currentPin !== row?.pin) throw new Error("Kodu değiştirmek için mevcut PIN gerekli");
          const lc = normCode(body.loginCode);
          if (lc.length < 4) throw new Error("Kod en az 4 karakter");
          if (!/^[A-Z0-9]+$/.test(lc)) throw new Error("Kod sadece harf ve rakam");
          const { data: dup } = await supabase.from("students").select("id").eq("login_code", lc).neq("id", studentId).limit(1);
          if (dup?.length) throw new Error("Bu kod kullanılıyor");
          updates.login_code = lc;
        }
        if (body.avatarUrl !== undefined) {
          const u = String(body.avatarUrl || "");
          if (u.length > 350000) throw new Error("Fotoğraf çok büyük");
          updates.avatar_url = u;
        }
        if (Object.keys(updates).length === 0) return json({ ok: true });
        const { error } = await supabase.from("students").update(updates).eq("id", studentId);
        if (error) throw error;
        return json({ ok: true });
      }
      default:
        return err("Bilinmeyen action: " + action);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(msg);
  }
});
