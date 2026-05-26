// Reads Claude Code's local data under ~/.claude and exposes it to the frontend.
//
// Layout we rely on:
//   ~/.claude/projects/<slug>/<sessionId>.jsonl   — per-session transcripts
//   ~/.claude/projects/<slug>/memory/MEMORY.md     — memory index
//   ~/.claude/projects/<slug>/memory/*.md          — individual memory facts
//
// Task progress is not stored as a list; it is reconstructed by replaying
// `TaskCreate` / `TaskUpdate` tool calls found inside a session transcript.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use serde_json::Value;
use tauri::Manager;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcProject {
    slug: String,
    path: String,
    session_count: usize,
    last_activity: Option<String>,
    has_memory: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CcTask {
    id: String,
    subject: String,
    status: String,
    active_form: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CcCounts {
    total: usize,
    pending: usize,
    in_progress: usize,
    completed: usize,
    other: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcSession {
    id: String,
    title: Option<String>,
    last_prompt: Option<String>,
    started_at: Option<String>,
    last_activity: Option<String>,
    message_count: usize,
    tasks: Vec<CcTask>,
    counts: CcCounts,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcMemoryFile {
    name: String,
    description: Option<String>,
    mem_type: Option<String>,
    body: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcMemory {
    index: Option<String>,
    files: Vec<CcMemoryFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcProjectDetail {
    slug: String,
    path: String,
    memory: CcMemory,
    sessions: Vec<CcSession>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CcStatus {
    /// Whether `~/.claude` exists on this machine — the integration's "connected".
    available: bool,
    /// Projects that have at least one session transcript.
    project_count: usize,
    /// Whether a usable Mavis brain is wired up (mavis.md resolves to a real dir).
    mavis_installed: bool,
}

fn claude_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|e| format!("cannot resolve home dir: {e}"))?;
    Ok(home.join(".claude"))
}

/// Session transcript files are the `*.jsonl` files directly inside a project
/// folder (subdirectories like `memory/` or `<id>/subagents` are ignored).
fn session_files(project_dir: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(project_dir) {
        for e in entries.flatten() {
            let p = e.path();
            if p.is_file() && p.extension().and_then(|s| s.to_str()) == Some("jsonl") {
                out.push(p);
            }
        }
    }
    out
}

fn mtime_iso(path: &Path) -> Option<String> {
    let modified = fs::metadata(path).ok()?.modified().ok()?;
    let dt: chrono::DateTime<chrono::Utc> = modified.into();
    Some(dt.to_rfc3339())
}

/// Scan a transcript for the first `cwd` field — Claude Code stamps the working
/// directory on most message lines, and it is the reliable real path (the folder
/// slug is lossy because `-` is ambiguous with path separators).
fn first_cwd(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    for line in content.lines() {
        if !line.contains("\"cwd\"") {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            if let Some(cwd) = v.get("cwd").and_then(|c| c.as_str()) {
                if !cwd.is_empty() {
                    return Some(cwd.to_string());
                }
            }
        }
    }
    None
}

/// Newest session file in a project (by mtime), used to derive the project path.
fn newest_session(project_dir: &Path) -> Option<PathBuf> {
    session_files(project_dir)
        .into_iter()
        .filter_map(|p| {
            let m = fs::metadata(&p).ok()?.modified().ok()?;
            Some((p, m))
        })
        .max_by_key(|(_, m)| *m)
        .map(|(p, _)| p)
}

fn project_path(project_dir: &Path, slug: &str) -> String {
    newest_session(project_dir)
        .and_then(|p| first_cwd(&p))
        .unwrap_or_else(|| slug.to_string())
}

#[tauri::command]
pub fn cc_list_projects(app: tauri::AppHandle) -> Result<Vec<CcProject>, String> {
    let projects_dir = claude_dir(&app)?.join("projects");
    let mut out = Vec::new();

    let entries = match fs::read_dir(&projects_dir) {
        Ok(e) => e,
        // No Claude Code data on this machine yet — return empty, not an error.
        Err(_) => return Ok(out),
    };

    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let slug = entry.file_name().to_string_lossy().to_string();
        let files = session_files(&dir);
        if files.is_empty() {
            continue;
        }
        let last_activity = files.iter().filter_map(|p| mtime_iso(p)).max();
        let has_memory = dir.join("memory").is_dir()
            && fs::read_dir(dir.join("memory"))
                .map(|mut it| it.next().is_some())
                .unwrap_or(false);

        out.push(CcProject {
            path: project_path(&dir, &slug),
            slug,
            session_count: files.len(),
            last_activity,
            has_memory,
        });
    }

    // Most recently active project first.
    out.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));
    Ok(out)
}

/// Lightweight "is the Claude Code integration reachable" probe for Settings.
/// Connected = `~/.claude` exists; also reports project count and whether the
/// Mavis brain is installed.
#[tauri::command]
pub fn cc_status(app: tauri::AppHandle) -> Result<CcStatus, String> {
    let claude = claude_dir(&app)?;
    if !claude.is_dir() {
        return Ok(CcStatus {
            available: false,
            project_count: 0,
            mavis_installed: false,
        });
    }
    let project_count = cc_list_projects(app.clone())?.len();
    let mavis_installed = fs::read_to_string(claude.join("commands").join("mavis.md"))
        .ok()
        .and_then(|t| extract_brain_path(&t))
        .map(|p| PathBuf::from(p).is_dir())
        .unwrap_or(false);
    Ok(CcStatus {
        available: true,
        project_count,
        mavis_installed,
    })
}

/// Parse a single transcript into a session summary, reconstructing its task list.
fn parse_session(path: &Path) -> Option<CcSession> {
    let id = path.file_stem()?.to_string_lossy().to_string();
    let content = fs::read_to_string(path).ok()?;

    let mut title: Option<String> = None;
    let mut last_prompt: Option<String> = None;
    let mut started_at: Option<String> = None;
    let mut last_activity: Option<String> = None;
    let mut message_count = 0usize;

    // Task reconstruction state.
    let mut tasks: Vec<CcTask> = Vec::new();
    let mut id_index: HashMap<String, usize> = HashMap::new();
    // tool_use_id of a TaskCreate -> (subject, activeForm), pending its result.
    let mut pending_creates: HashMap<String, (String, Option<String>)> = HashMap::new();

    for line in content.lines() {
        let v: Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => continue,
        };

        match v.get("type").and_then(|t| t.as_str()) {
            Some("ai-title") => {
                if let Some(t) = v.get("aiTitle").and_then(|t| t.as_str()) {
                    title = Some(t.to_string());
                }
            }
            Some("last-prompt") => {
                if let Some(p) = v.get("lastPrompt").and_then(|p| p.as_str()) {
                    last_prompt = Some(p.to_string());
                }
            }
            Some("user") | Some("assistant") => message_count += 1,
            _ => {}
        }

        if let Some(ts) = v.get("timestamp").and_then(|t| t.as_str()) {
            if started_at.is_none() {
                started_at = Some(ts.to_string());
            }
            last_activity = Some(ts.to_string());
        }

        let content_arr = match v.get("message").and_then(|m| m.get("content")) {
            Some(Value::Array(a)) => a,
            _ => continue,
        };

        for item in content_arr {
            let itype = item.get("type").and_then(|t| t.as_str());
            match itype {
                Some("tool_use") => {
                    let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let input = item.get("input");
                    if name == "TaskCreate" {
                        if let Some(tu_id) = item.get("id").and_then(|i| i.as_str()) {
                            let subject = input
                                .and_then(|i| i.get("subject"))
                                .and_then(|s| s.as_str())
                                .unwrap_or("(untitled task)")
                                .to_string();
                            let active_form = input
                                .and_then(|i| i.get("activeForm"))
                                .and_then(|s| s.as_str())
                                .map(|s| s.to_string());
                            pending_creates.insert(tu_id.to_string(), (subject, active_form));
                        }
                    } else if name == "TaskUpdate" {
                        let task_id = input
                            .and_then(|i| i.get("taskId"))
                            .map(value_to_id_string);
                        let status = input
                            .and_then(|i| i.get("status"))
                            .and_then(|s| s.as_str());
                        if let (Some(tid), Some(st)) = (task_id, status) {
                            if let Some(&idx) = id_index.get(&tid) {
                                tasks[idx].status = st.to_string();
                            }
                        }
                    }
                }
                Some("tool_result") => {
                    if let Some(tu_id) = item.get("tool_use_id").and_then(|i| i.as_str()) {
                        if let Some((subject, active_form)) = pending_creates.remove(tu_id) {
                            let result_text = tool_result_text(item);
                            // Result reads "Task #N created successfully: ...".
                            let task_id = parse_task_number(&result_text)
                                .unwrap_or_else(|| (tasks.len() + 1).to_string());
                            id_index.insert(task_id.clone(), tasks.len());
                            tasks.push(CcTask {
                                id: task_id,
                                subject,
                                status: "pending".to_string(),
                                active_form,
                            });
                        }
                    }
                }
                _ => {}
            }
        }
    }

    let mut counts = CcCounts {
        total: tasks.len(),
        ..Default::default()
    };
    for t in &tasks {
        match t.status.as_str() {
            "pending" => counts.pending += 1,
            "in_progress" => counts.in_progress += 1,
            "completed" => counts.completed += 1,
            _ => counts.other += 1,
        }
    }

    Some(CcSession {
        id,
        title,
        last_prompt,
        started_at,
        last_activity,
        message_count,
        tasks,
        counts,
    })
}

fn value_to_id_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => v.to_string(),
    }
}

/// tool_result `content` is either a string or an array of `{type:text, text}`.
fn tool_result_text(item: &Value) -> String {
    match item.get("content") {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(a)) => a
            .iter()
            .filter_map(|c| c.get("text").and_then(|t| t.as_str()))
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

fn parse_task_number(text: &str) -> Option<String> {
    let after = text.split('#').nth(1)?;
    let digits: String = after.chars().take_while(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        None
    } else {
        Some(digits)
    }
}

fn parse_memory(memory_dir: &Path) -> CcMemory {
    let index = fs::read_to_string(memory_dir.join("MEMORY.md")).ok();
    let mut files = Vec::new();

    if let Ok(entries) = fs::read_dir(memory_dir) {
        for e in entries.flatten() {
            let p = e.path();
            let name = e.file_name().to_string_lossy().to_string();
            if p.extension().and_then(|s| s.to_str()) != Some("md") || name == "MEMORY.md" {
                continue;
            }
            let raw = match fs::read_to_string(&p) {
                Ok(c) => c,
                Err(_) => continue,
            };
            let (description, mem_type, body) = parse_memory_doc(&raw);
            files.push(CcMemoryFile {
                name,
                description,
                mem_type,
                body,
            });
        }
    }
    files.sort_by(|a, b| a.name.cmp(&b.name));

    CcMemory { index, files }
}

/// Pull `description` and `metadata.type` out of the YAML frontmatter and return
/// the markdown body after it. Intentionally line-based, not a full YAML parser.
fn parse_memory_doc(raw: &str) -> (Option<String>, Option<String>, String) {
    let trimmed = raw.trim_start();
    if !trimmed.starts_with("---") {
        return (None, None, raw.trim().to_string());
    }
    let mut description = None;
    let mut mem_type = None;
    let mut closed = false;
    let mut fm_line_count = 1; // opening fence
    for line in trimmed.lines().skip(1) {
        fm_line_count += 1;
        if line.trim() == "---" {
            closed = true;
            break;
        }
        let t = line.trim();
        if let Some(rest) = t.strip_prefix("description:") {
            description = Some(unquote(rest.trim()));
        } else if let Some(rest) = t.strip_prefix("type:") {
            mem_type = Some(rest.trim().to_string());
        }
    }

    let body = if closed {
        trimmed
            .lines()
            .skip(fm_line_count)
            .collect::<Vec<_>>()
            .join("\n")
            .trim()
            .to_string()
    } else {
        raw.trim().to_string()
    };

    (description, mem_type, body)
}

fn unquote(s: &str) -> String {
    let s = s.trim();
    if (s.starts_with('"') && s.ends_with('"') && s.len() >= 2)
        || (s.starts_with('\'') && s.ends_with('\'') && s.len() >= 2)
    {
        s[1..s.len() - 1].to_string()
    } else {
        s.to_string()
    }
}

// ---------------------------------------------------------------------------
// Mavis brain integration
//
// "Mavis" is a separate long-term-memory system the user installed. Its brain
// is a markdown repo whose location is declared in ~/.claude/commands/mavis.md.
// We discover the brain path from that command file (rather than hardcoding it)
// and surface per-project records only — each project's index.md (Summary),
// notes.md (Notes/Guardrails), and progress.md (Progress). Each Mavis project's
// `index.md` frontmatter carries a `path:` field that matches a real working
// directory — the same path we derive for Claude Code projects — which lets the
// frontend link the two.
// ---------------------------------------------------------------------------

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MavisProject {
    name: String,
    path: Option<String>,
    description: String,
    progress: String,
    notes: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MavisBrain {
    installed: bool,
    projects: Vec<MavisProject>,
}

impl MavisBrain {
    fn not_installed() -> Self {
        MavisBrain {
            installed: false,
            projects: Vec::new(),
        }
    }
}

/// Pull the brain root out of mavis.md. Prefers a backticked path ending in
/// `CLAUDE.md` (e.g. `C:\...\MavisCode\CLAUDE.md`); falls back to the
/// "brain at <path>" phrase in the frontmatter description.
fn extract_brain_path(mavis_md: &str) -> Option<String> {
    for seg in mavis_md.split('`') {
        let s = seg.trim();
        let lower = s.to_lowercase();
        if lower.ends_with("claude.md") && (s.contains(":\\") || s.contains(":/") || s.starts_with('/')) {
            let root = &s[..s.len() - "claude.md".len()];
            let root = root.trim_end_matches(['\\', '/']);
            if !root.is_empty() {
                return Some(root.to_string());
            }
        }
    }
    if let Some(idx) = mavis_md.find("brain at ") {
        let rest = &mavis_md[idx + "brain at ".len()..];
        let end = rest.find(['\n', '.']).unwrap_or(rest.len());
        let p = rest[..end].trim();
        if !p.is_empty() {
            return Some(p.to_string());
        }
    }
    None
}

/// Split a markdown doc into (frontmatter, body). Frontmatter must be a leading
/// `---` … `---` block.
fn split_frontmatter(raw: &str) -> (Option<String>, String) {
    let trimmed = raw.trim_start();
    if let Some(after) = trimmed.strip_prefix("---") {
        if let Some(pos) = after.find("\n---") {
            let fm = after[..pos].trim_matches(['\r', '\n']).to_string();
            let rest = &after[pos + 4..];
            let body = match rest.find('\n') {
                Some(i) => &rest[i + 1..],
                None => "",
            };
            return (Some(fm), body.trim().to_string());
        }
    }
    (None, raw.trim().to_string())
}

fn fm_field(fm: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}:");
    for line in fm.lines() {
        let t = line.trim();
        if let Some(rest) = t.strip_prefix(&prefix) {
            return Some(unquote(rest.trim()));
        }
    }
    None
}

fn read_opt(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn parse_mavis_projects(projects_dir: &Path) -> Vec<MavisProject> {
    // `last_accessed` rides alongside each row for ordering only — it isn't part
    // of the payload the UI consumes, so it never lands in MavisProject.
    let mut rows: Vec<(Option<String>, MavisProject)> = Vec::new();
    let entries = match fs::read_dir(projects_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    for entry in entries.flatten() {
        let dir = entry.path();
        if !dir.is_dir() {
            continue;
        }
        let index = match fs::read_to_string(dir.join("index.md")) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let (fm, body) = split_frontmatter(&index);
        let fm = fm.unwrap_or_default();
        let name = fm_field(&fm, "name")
            .unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());
        rows.push((
            fm_field(&fm, "last_accessed"),
            MavisProject {
                name,
                path: fm_field(&fm, "path"),
                description: body,
                progress: read_opt(&dir.join("progress.md")).unwrap_or_default(),
                notes: read_opt(&dir.join("notes.md")).unwrap_or_default(),
            },
        ));
    }
    // Most recently accessed first.
    rows.sort_by(|a, b| b.0.cmp(&a.0));
    rows.into_iter().map(|(_, p)| p).collect()
}

#[tauri::command]
pub fn cc_mavis_brain(app: tauri::AppHandle) -> Result<MavisBrain, String> {
    let claude = claude_dir(&app)?;
    let mavis_cmd = claude.join("commands").join("mavis.md");
    let cmd_text = match fs::read_to_string(&mavis_cmd) {
        Ok(t) => t,
        Err(_) => return Ok(MavisBrain::not_installed()),
    };
    let brain_path = match extract_brain_path(&cmd_text) {
        Some(p) => p,
        None => return Ok(MavisBrain::not_installed()),
    };
    let brain = PathBuf::from(&brain_path);
    if !brain.is_dir() {
        return Ok(MavisBrain::not_installed());
    }

    // `brain_path` was resolved above only to locate and validate the install;
    // the UI needs just the per-project records.
    Ok(MavisBrain {
        installed: true,
        projects: parse_mavis_projects(&brain.join("projects")),
    })
}

#[tauri::command]
pub fn cc_project_detail(app: tauri::AppHandle, slug: String) -> Result<CcProjectDetail, String> {
    let claude = claude_dir(&app)?;
    let dir = claude.join("projects").join(&slug);
    if !dir.is_dir() {
        return Err(format!("unknown Claude Code project: {slug}"));
    }

    let path = project_path(&dir, &slug);

    let mut sessions: Vec<CcSession> = session_files(&dir)
        .iter()
        .filter_map(|p| parse_session(p))
        .collect();
    // Most recently active session first — the top one is the "current" work.
    sessions.sort_by(|a, b| b.last_activity.cmp(&a.last_activity));

    let memory = parse_memory(&dir.join("memory"));

    Ok(CcProjectDetail {
        slug,
        path,
        memory,
        sessions,
    })
}
