mod commands;
mod export;
mod focus;
mod google_auth;
mod import;
mod ipc_server;
mod llm;
mod models;
mod progress;
mod recurring;

use std::sync::{Arc, Mutex};
use tauri::{
    Manager, AppHandle, State,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    WindowEvent,
};

use ipc_server::IpcServerState;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_sql::{Migration, MigrationKind};
use tauri_plugin_store::StoreExt;

use llm::{ClaudeProvider, LLMProvider, LLMRequest, LLMMessage};

fn get_migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create initial tables",
            sql: include_str!("db/migrations/001_initial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "add progress tracking tables",
            sql: include_str!("db/migrations/002_progress_tracking.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "add recurring plans tables",
            sql: include_str!("db/migrations/003_recurring_plans.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "add location to tasks",
            sql: include_str!("db/migrations/004_task_location.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

struct CurrentShortcut(Mutex<Shortcut>);
struct ApiKeyState(Mutex<Option<String>>);
struct IpcState(Arc<IpcServerState>);

// Google OAuth 상태 관리를 위한 re-export
use google_auth::OAuthState;

fn toggle_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// 닫기 버튼 클릭 시 종료 대신 숨김 처리
fn setup_close_behavior(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let app_handle = app.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // 종료 대신 숨김
                api.prevent_close();
                if let Some(win) = app_handle.get_webview_window("main") {
                    let _ = win.hide();
                }
            }
        });
    }
}

/// 시스템 트레이 설정
fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let quit = tauri::menu::MenuItem::with_id(app, "quit", "Quit Schedule AI", true, None::<&str>)?;
    let show = tauri::menu::MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;

    let menu = tauri::menu::Menu::with_items(app, &[&show, &quit])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => {
                app.exit(0);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn parse_shortcut(shortcut_str: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = shortcut_str.split('+').map(|s| s.trim()).collect();
    let mut modifiers = Modifiers::empty();
    let mut code: Option<Code> = None;

    for part in parts {
        match part.to_uppercase().as_str() {
            "ALT" | "OPTION" => modifiers |= Modifiers::ALT,
            "SHIFT" => modifiers |= Modifiers::SHIFT,
            "CTRL" | "CONTROL" => modifiers |= Modifiers::CONTROL,
            "CMD" | "COMMAND" | "SUPER" => modifiers |= Modifiers::SUPER,
            "SPACE" => code = Some(Code::Space),
            "A" => code = Some(Code::KeyA),
            "B" => code = Some(Code::KeyB),
            "C" => code = Some(Code::KeyC),
            "D" => code = Some(Code::KeyD),
            "E" => code = Some(Code::KeyE),
            "F" => code = Some(Code::KeyF),
            "G" => code = Some(Code::KeyG),
            "H" => code = Some(Code::KeyH),
            "I" => code = Some(Code::KeyI),
            "J" => code = Some(Code::KeyJ),
            "K" => code = Some(Code::KeyK),
            "L" => code = Some(Code::KeyL),
            "M" => code = Some(Code::KeyM),
            "N" => code = Some(Code::KeyN),
            "O" => code = Some(Code::KeyO),
            "P" => code = Some(Code::KeyP),
            "Q" => code = Some(Code::KeyQ),
            "R" => code = Some(Code::KeyR),
            "S" => code = Some(Code::KeyS),
            "T" => code = Some(Code::KeyT),
            "U" => code = Some(Code::KeyU),
            "V" => code = Some(Code::KeyV),
            "W" => code = Some(Code::KeyW),
            "X" => code = Some(Code::KeyX),
            "Y" => code = Some(Code::KeyY),
            "Z" => code = Some(Code::KeyZ),
            _ => {}
        }
    }

    code.map(|c| Shortcut::new(Some(modifiers), c))
}

#[tauri::command]
fn get_current_shortcut(state: State<CurrentShortcut>) -> String {
    let shortcut = state.0.lock().unwrap();
    format_shortcut(&shortcut)
}

#[tauri::command]
fn set_shortcut(app: AppHandle, state: State<CurrentShortcut>, shortcut_str: String) -> Result<String, String> {
    let new_shortcut = parse_shortcut(&shortcut_str).ok_or("Invalid shortcut format")?;

    // Unregister old shortcut
    {
        let old_shortcut = state.0.lock().unwrap();
        let _ = app.global_shortcut().unregister(old_shortcut.clone());
    }

    // Register new shortcut
    app.global_shortcut()
        .register(new_shortcut.clone())
        .map_err(|e| e.to_string())?;

    // Update state
    {
        let mut current = state.0.lock().unwrap();
        *current = new_shortcut;
    }

    Ok(shortcut_str)
}

// API Key management commands
#[tauri::command]
fn get_api_key(app: AppHandle, state: State<ApiKeyState>) -> String {
    // First check memory state
    if let Some(key) = state.0.lock().unwrap().clone() {
        return key;
    }

    // Try to load from store
    if let Ok(store) = app.store("settings.json") {
        if let Some(key) = store.get("api_key") {
            if let Some(key_str) = key.as_str() {
                let key_string = key_str.to_string();
                *state.0.lock().unwrap() = Some(key_string.clone());
                return key_string;
            }
        }
    }

    String::new()
}

#[tauri::command]
fn set_api_key(app: AppHandle, state: State<ApiKeyState>, api_key: String) -> Result<(), String> {
    // Save to store
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("api_key", serde_json::json!(api_key.clone()));
    store.save().map_err(|e| e.to_string())?;

    // Update memory state
    *state.0.lock().unwrap() = Some(api_key);

    Ok(())
}

#[tauri::command]
fn delete_api_key(app: AppHandle, state: State<ApiKeyState>) -> Result<(), String> {
    // Remove from store
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.delete("api_key");
    store.save().map_err(|e| e.to_string())?;

    // Clear memory state
    *state.0.lock().unwrap() = None;

    Ok(())
}

// Plan rules management commands
#[tauri::command]
fn get_plan_rules(app: AppHandle) -> String {
    if let Ok(store) = app.store("settings.json") {
        if let Some(rules) = store.get("plan_rules") {
            if let Some(rules_str) = rules.as_str() {
                return rules_str.to_string();
            }
        }
    }
    String::new()
}

#[tauri::command]
fn set_plan_rules(app: AppHandle, rules: String) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("plan_rules", serde_json::json!(rules));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// Tab shortcuts management commands
#[tauri::command]
fn get_tab_shortcuts(app: AppHandle) -> Vec<String> {
    let default_shortcuts = vec![
        "1".to_string(),
        "2".to_string(),
        "3".to_string(),
        "4".to_string(),
        "5".to_string(),
    ];

    if let Ok(store) = app.store("settings.json") {
        if let Some(shortcuts) = store.get("tab_shortcuts") {
            if let Some(arr) = shortcuts.as_array() {
                let result: Vec<String> = arr
                    .iter()
                    .filter_map(|v| v.as_str().map(|s| s.to_string()))
                    .collect();
                if result.len() == 5 {
                    return result;
                }
            }
        }
    }
    default_shortcuts
}

#[tauri::command]
fn set_tab_shortcuts(app: AppHandle, shortcuts: Vec<String>) -> Result<(), String> {
    if shortcuts.len() != 5 {
        return Err("Must provide exactly 5 shortcuts".to_string());
    }
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("tab_shortcuts", serde_json::json!(shortcuts));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// AI Input mode shortcut commands
#[tauri::command]
fn get_ai_input_shortcut(app: AppHandle) -> String {
    if let Ok(store) = app.store("settings.json") {
        if let Some(shortcut) = store.get("ai_input_shortcut") {
            if let Some(s) = shortcut.as_str() {
                return s.to_string();
            }
        }
    }
    "shift+tab".to_string() // 기본값
}

#[tauri::command]
fn set_ai_input_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("ai_input_shortcut", serde_json::json!(shortcut));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// Focus input shortcut commands
#[tauri::command]
fn get_focus_input_shortcut(app: AppHandle) -> String {
    if let Ok(store) = app.store("settings.json") {
        if let Some(shortcut) = store.get("focus_input_shortcut") {
            if let Some(s) = shortcut.as_str() {
                return s.to_string();
            }
        }
    }
    // macOS: cmd+l, others: ctrl+l
    #[cfg(target_os = "macos")]
    {
        "cmd+l".to_string()
    }
    #[cfg(not(target_os = "macos"))]
    {
        "ctrl+l".to_string()
    }
}

#[tauri::command]
fn set_focus_input_shortcut(app: AppHandle, shortcut: String) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("focus_input_shortcut", serde_json::json!(shortcut));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

// Language settings commands
#[tauri::command]
fn get_system_locale() -> String {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        // defaults read -g AppleLocale (e.g., ko_KR, en_US)
        if let Ok(output) = Command::new("defaults")
            .args(["read", "-g", "AppleLocale"])
            .output()
        {
            if let Ok(locale) = String::from_utf8(output.stdout) {
                let locale = locale.trim();
                // ko_KR -> ko, en_US -> en
                return locale.split('_').next().unwrap_or("en").to_string();
            }
        }
    }

    // fallback
    "en".to_string()
}

#[tauri::command]
fn get_language(app: AppHandle) -> Option<String> {
    if let Ok(store) = app.store("settings.json") {
        if let Some(lang) = store.get("language") {
            return lang.as_str().map(|s| s.to_string());
        }
    }
    None
}

#[tauri::command]
fn set_language(app: AppHandle, language: String) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    store.set("language", serde_json::json!(language));
    store.save().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn validate_api_key(state: State<'_, ApiKeyState>) -> Result<bool, String> {
    let api_key = state.0.lock().unwrap().clone();

    match api_key {
        Some(key) if !key.is_empty() => {
            let provider = ClaudeProvider::new(key);
            let request = LLMRequest {
                messages: vec![LLMMessage {
                    role: "user".to_string(),
                    content: "Hi".to_string(),
                }],
                max_tokens: Some(10),
                temperature: Some(0.0),
            };

            match provider.complete(request).await {
                Ok(_) => Ok(true),
                Err(_) => Ok(false),
            }
        }
        _ => Ok(false),
    }
}

#[tauri::command]
async fn split_task_with_ai(
    state: State<'_, ApiKeyState>,
    task_title: String,
) -> Result<commands::llm::SplitTaskResponse, String> {
    let api_key = state.0.lock().unwrap().clone()
        .ok_or("API key not set")?;

    let provider = ClaudeProvider::new(api_key);

    let system_prompt = r#"당신은 ADHD 환자를 돕는 일정 관리 AI입니다.
주어진 태스크를 ADHD 친화적인 작은 단위(5-15분)로 분해해주세요.

원칙:
- 각 서브태스크는 명확하고 구체적으로
- 시작하기 쉬운 작은 첫 단계
- 완료 기준이 명확해야 함
- 3-5개의 서브태스크로 분해

JSON 형식으로만 응답하세요:
{"subtasks": [{"title": "서브태스크 제목", "estimated_minutes": 10}]}"#;

    let request = LLMRequest {
        messages: vec![
            LLMMessage {
                role: "user".to_string(),
                content: format!("{}\n\n태스크: {}", system_prompt, task_title),
            },
        ],
        max_tokens: Some(1024),
        temperature: Some(0.7),
    };

    let response = provider.complete(request).await.map_err(|e| e.to_string())?;

    // Parse the JSON response - handle markdown code blocks
    let content = response.content.trim();
    let json_str = if content.starts_with("```") {
        content
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        content
    };

    let parsed: commands::llm::SplitTaskResponse = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse LLM response: {}. Response: {}", e, json_str))?;

    Ok(parsed)
}

#[tauri::command]
async fn parse_task_with_ai(
    state: State<'_, ApiKeyState>,
    input: String,
    current_date: String,
) -> Result<commands::llm::ParseTaskResponse, String> {
    let api_key = state.0.lock().unwrap().clone()
        .ok_or("API key not set")?;

    let provider = ClaudeProvider::new(api_key);

    let system_prompt = format!(r#"당신은 ADHD 환자를 돕는 일정 관리 AI입니다.
사용자의 자연어 입력을 분석하여 구조화된 태스크 정보로 변환해주세요.

오늘 날짜: {}

입력에서 다음 정보를 추출하세요:
- title: 태스크 제목 (필수)
- scheduled_date: 날짜 "YYYY-MM-DD" (없으면 오늘)
- scheduled_time: 시작 시간 "HH:MM" (있으면)
- end_time: 종료 시간 "HH:MM" (있으면)
- location: 장소 (있으면)
- subtasks: 서브태스크 배열 (있으면)
- priority: 우선순위 0-3 (기본값 1)
- estimated_duration: 예상 소요시간(분) (시작/종료 시간으로 계산하거나 추정)

날짜 키워드:
- "오늘" = 오늘 날짜
- "내일" = 오늘 + 1일
- "모레" = 오늘 + 2일
- "다음주" = 오늘 + 7일

JSON 형식으로만 응답하세요 (마크다운 코드블록 없이):
{{"title": "태스크 제목", "scheduled_date": "2026-01-15", "scheduled_time": "14:00", "location": "카페", "subtasks": ["준비물 챙기기"], "priority": 1, "estimated_duration": 60}}"#, current_date);

    let request = LLMRequest {
        messages: vec![
            LLMMessage {
                role: "user".to_string(),
                content: format!("{}\n\n입력: {}", system_prompt, input),
            },
        ],
        max_tokens: Some(1024),
        temperature: Some(0.3),
    };

    let response = provider.complete(request).await.map_err(|e| e.to_string())?;

    // Parse the JSON response - handle markdown code blocks
    let content = response.content.trim();
    let json_str = if content.starts_with("```") {
        content
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        content
    };

    let parsed: commands::llm::ParseTaskResponse = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse LLM response: {}. Response: {}", e, json_str))?;

    Ok(parsed)
}

#[tauri::command]
async fn parse_plan_with_ai(
    state: State<'_, ApiKeyState>,
    plan_input: String,
    plan_rules: Option<String>,
) -> Result<commands::llm::ParsePlanResponse, String> {
    let api_key = state.0.lock().unwrap().clone()
        .ok_or("API key not set")?;

    let provider = ClaudeProvider::new(api_key);

    let rules_section = plan_rules
        .filter(|r| !r.is_empty())
        .map(|r| format!("\n\n사용자의 개인 규칙:\n{}", r))
        .unwrap_or_default();

    let system_prompt = format!(r#"당신은 ADHD 환자를 돕는 일정 관리 AI입니다.
사용자의 계획을 분석하여 구조화된 JSON으로 변환해주세요.

원칙:
- 목표는 구체적이고 측정 가능하게
- 마일스톤은 중간 목표로 설정
- 일일 태스크는 15-45분 단위로{}

JSON 형식으로만 응답하세요:
{{
  "goals": ["목표1", "목표2"],
  "milestones": [
    {{"title": "마일스톤", "target_date": "2025-01-15"}}
  ],
  "suggested_tasks": [
    {{"title": "일일 태스크", "estimated_duration": 30, "priority": 1}}
  ]
}}"#, rules_section);

    let request = LLMRequest {
        messages: vec![
            LLMMessage {
                role: "user".to_string(),
                content: format!("{}\n\n계획:\n{}", system_prompt, plan_input),
            },
        ],
        max_tokens: Some(2048),
        temperature: Some(0.7),
    };

    let response = provider.complete(request).await.map_err(|e| e.to_string())?;

    // Parse the JSON response - handle markdown code blocks
    let content = response.content.trim();
    let json_str = if content.starts_with("```") {
        content
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        content
    };

    // Parse into intermediate structure
    #[derive(serde::Deserialize)]
    struct ParsedContent {
        goals: Vec<String>,
        milestones: Option<Vec<serde_json::Value>>,
        suggested_tasks: Vec<serde_json::Value>,
    }

    let parsed: ParsedContent = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse LLM response: {}. Response: {}", e, json_str))?;

    // Convert to our response type
    let suggested_tasks: Vec<models::SuggestedTask> = parsed.suggested_tasks
        .into_iter()
        .map(|t| models::SuggestedTask {
            title: t.get("title").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            estimated_duration: t.get("estimated_duration").and_then(|v| v.as_i64()).map(|v| v as i32),
            priority: t.get("priority").and_then(|v| v.as_i64()).unwrap_or(1) as i32,
            frequency: None,
        })
        .collect();

    Ok(commands::llm::ParsePlanResponse {
        parsed_content: models::ParsedPlanContent {
            goals: parsed.goals,
            milestones: vec![],
            suggested_tasks,
        },
    })
}

#[tauri::command]
async fn generate_daily_tasks_with_ai(
    state: State<'_, ApiKeyState>,
    plan_title: String,
    plan_description: String,
    date: String,
    plan_rules: Option<String>,
) -> Result<commands::llm::GenerateDailyTasksResponse, String> {
    let api_key = state.0.lock().unwrap().clone()
        .ok_or("API key not set")?;

    let provider = ClaudeProvider::new(api_key);

    let rules_section = plan_rules
        .filter(|r| !r.is_empty())
        .map(|r| format!("\n\n사용자의 개인 규칙:\n{}", r))
        .unwrap_or_default();

    let system_prompt = format!(r#"당신은 ADHD 환자를 돕는 일정 관리 AI입니다.
주어진 계획을 기반으로 오늘 할 태스크를 생성해주세요.

원칙:
- ADHD 친화적인 작은 단위(15-45분)
- 시작하기 쉬운 간단한 태스크부터
- 3-5개의 태스크 생성
- 구체적이고 실행 가능한 태스크{}

JSON 형식으로만 응답하세요:
{{
  "tasks": [
    {{"title": "태스크", "description": "설명", "estimated_duration": 25, "priority": 1, "scheduled_time": "09:00"}}
  ],
  "summary": "오늘의 요약"
}}"#, rules_section);

    let request = LLMRequest {
        messages: vec![
            LLMMessage {
                role: "user".to_string(),
                content: format!(
                    "{}\n\n계획: {}\n설명: {}\n날짜: {}",
                    system_prompt, plan_title, plan_description, date
                ),
            },
        ],
        max_tokens: Some(2048),
        temperature: Some(0.7),
    };

    let response = provider.complete(request).await.map_err(|e| e.to_string())?;

    // Parse the JSON response - handle markdown code blocks
    let content = response.content.trim();
    let json_str = if content.starts_with("```") {
        content
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        content
    };

    let parsed: commands::llm::GenerateDailyTasksResponse = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse LLM response: {}. Response: {}", e, json_str))?;

    Ok(parsed)
}

// Export/Import commands

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub plans_count: usize,
    pub tasks_count: usize,
    pub path: String,
}

#[tauri::command]
async fn export_plan_to_markdown(plan: models::Plan) -> Result<String, String> {
    Ok(export::plan_to_markdown(&plan))
}

#[tauri::command]
async fn export_tasks_to_markdown(date: String, tasks: Vec<models::Task>) -> Result<String, String> {
    Ok(export::tasks_to_daily_markdown(&date, &tasks))
}

#[tauri::command]
async fn export_all_to_json(plans: Vec<models::Plan>, tasks: Vec<models::Task>) -> Result<String, String> {
    let data = export::ExportData::new(plans, tasks);
    data.to_json().map_err(|e| e.to_string())
}

#[tauri::command]
async fn export_to_folder(
    folder_path: String,
    plans: Vec<models::Plan>,
    tasks: Vec<models::Task>,
) -> Result<ExportResult, String> {
    use std::fs;
    use std::path::Path;

    let base_path = Path::new(&folder_path);

    // plans 폴더 생성
    let plans_path = base_path.join("plans");
    fs::create_dir_all(&plans_path).map_err(|e| e.to_string())?;

    // tasks 폴더 생성
    let tasks_path = base_path.join("tasks");
    fs::create_dir_all(&tasks_path).map_err(|e| e.to_string())?;

    // Plans 저장
    for plan in &plans {
        let filename = sanitize_filename(&plan.title);
        let file_path = plans_path.join(format!("{}.md", filename));
        let content = export::plan_to_markdown(plan);
        fs::write(&file_path, content).map_err(|e| e.to_string())?;
    }

    // Tasks를 날짜별로 그룹화하여 저장
    let mut tasks_by_date: std::collections::HashMap<String, Vec<models::Task>> =
        std::collections::HashMap::new();

    for task in tasks.clone() {
        tasks_by_date
            .entry(task.scheduled_date.clone())
            .or_default()
            .push(task);
    }

    for (date, date_tasks) in &tasks_by_date {
        let file_path = tasks_path.join(format!("{}.md", date));
        let content = export::tasks_to_daily_markdown(date, date_tasks);
        fs::write(&file_path, content).map_err(|e| e.to_string())?;
    }

    // JSON 백업도 저장
    let json_path = base_path.join("backup.json");
    let export_data = export::ExportData::new(plans.clone(), tasks.clone());
    let json_content = export_data.to_json().map_err(|e| e.to_string())?;
    fs::write(&json_path, json_content).map_err(|e| e.to_string())?;

    Ok(ExportResult {
        plans_count: plans.len(),
        tasks_count: tasks.len(),
        path: folder_path,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub plans_imported: usize,
    pub tasks_imported: usize,
}

#[tauri::command]
async fn import_from_json(json_content: String) -> Result<import::ImportData, String> {
    import::ImportData::from_json(&json_content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn import_plan_from_markdown(content: String) -> Result<models::Plan, String> {
    import::markdown_to_plan(&content).map_err(|e| e.to_string())
}

#[tauri::command]
async fn import_tasks_from_markdown(content: String) -> Result<Vec<models::Task>, String> {
    import::markdown_to_tasks(&content).map_err(|e| e.to_string())
}

// Progress tracking commands

#[tauri::command]
async fn calculate_daily_progress(
    date: String,
    tasks: Vec<models::Task>,
) -> Result<progress::DailyProgress, String> {
    Ok(progress::calculate_daily_progress(&date, &tasks))
}

#[tauri::command]
async fn get_heatmap_data(
    year: i32,
    all_progress: Vec<progress::DailyProgress>,
) -> Result<Vec<progress::HeatmapData>, String> {
    Ok(progress::generate_yearly_heatmap(year, &all_progress))
}

#[tauri::command]
async fn calculate_streak(
    progress_history: Vec<progress::DailyProgress>,
    today: String,
) -> Result<i32, String> {
    Ok(progress::calculate_streak(&progress_history, &today))
}

// Recurring plan commands

#[tauri::command]
async fn parse_recurrence_pattern(
    input: String,
) -> Result<Option<recurring::ParsedRecurrencePattern>, String> {
    Ok(recurring::parse_recurrence_pattern(&input))
}

#[tauri::command]
async fn parse_recurrence_pattern_with_ai(
    state: State<'_, ApiKeyState>,
    input: String,
) -> Result<recurring::ParsedRecurrencePattern, String> {
    let api_key = state.0.lock().unwrap().clone()
        .ok_or("API key not set")?;

    let provider = ClaudeProvider::new(api_key);

    let system_prompt = r#"당신은 자연어를 구조화된 반복 일정으로 변환하는 AI입니다.
사용자의 입력을 분석하여 반복 일정 패턴을 JSON으로 추출해주세요.

추출할 정보:
- recurrence_type: "daily", "weekly", "monthly" 중 하나
- interval_value: 반복 간격 (기본값 1, 격주면 2)
- days_of_week: 요일 배열 [0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토] (주간 반복 시)
- day_of_month: 월간 반복 시 날짜 (1-31)
- scheduled_time: 시작 시간 "HH:MM" 형식
- end_time: 종료 시간 "HH:MM" 형식 (있으면)
- estimated_duration: 소요 시간 (분 단위, start_time과 end_time으로 계산)
- start_date: 시작 날짜 "YYYY-MM-DD" 형식
- end_date: 종료 날짜 "YYYY-MM-DD" 형식 (있으면)
- title: 일정 제목
- location: 장소 (있으면)

요일 키워드:
- "평일" = [1,2,3,4,5]
- "주말" = [0,6]
- "월수금" = [1,3,5]

오늘 날짜: "#.to_string() + &chrono::Local::now().format("%Y-%m-%d").to_string() + r#"

JSON 형식으로만 응답하세요 (마크다운 코드블록 없이):
{
  "recurrence_type": "weekly",
  "interval_value": 1,
  "days_of_week": [6],
  "scheduled_time": "12:00",
  "end_time": "16:00",
  "estimated_duration": 240,
  "start_date": "2026-01-01",
  "end_date": "2026-02-28",
  "title": "토플 학원",
  "location": "강남역 근처"
}"#;

    let request = LLMRequest {
        messages: vec![
            LLMMessage {
                role: "user".to_string(),
                content: format!("{}\n\n입력: {}", system_prompt, input),
            },
        ],
        max_tokens: Some(1024),
        temperature: Some(0.3), // 결정론적인 결과를 위해 낮은 온도
    };

    let response = provider.complete(request).await.map_err(|e| e.to_string())?;

    // Parse the JSON response - handle markdown code blocks
    let content = response.content.trim();
    let json_str = if content.starts_with("```") {
        content
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        content
    };

    // LLM 응답을 중간 구조로 파싱
    #[derive(serde::Deserialize)]
    struct LLMParsedPattern {
        recurrence_type: Option<String>,
        interval_value: Option<i32>,
        days_of_week: Option<Vec<i32>>,
        day_of_month: Option<i32>,
        scheduled_time: Option<String>,
        end_time: Option<String>,
        estimated_duration: Option<i32>,
        start_date: Option<String>,
        end_date: Option<String>,
        title: Option<String>,
        location: Option<String>,
    }

    let parsed: LLMParsedPattern = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse LLM response: {}. Response: {}", e, json_str))?;

    // 변환
    let recurrence_type = match parsed.recurrence_type.as_deref() {
        Some("daily") => recurring::RecurrenceType::Daily,
        Some("monthly") => recurring::RecurrenceType::Monthly,
        _ => recurring::RecurrenceType::Weekly,
    };

    Ok(recurring::ParsedRecurrencePattern {
        recurrence_type,
        interval_value: parsed.interval_value.unwrap_or(1),
        days_of_week: parsed.days_of_week,
        day_of_month: parsed.day_of_month,
        scheduled_time: parsed.scheduled_time,
        end_time: parsed.end_time,
        estimated_duration: parsed.estimated_duration,
        start_date: parsed.start_date,
        end_date: parsed.end_date,
        title: parsed.title,
        location: parsed.location,
    })
}

#[tauri::command]
async fn generate_tasks_preview(
    recurring_plan: recurring::RecurringPlan,
) -> Result<Vec<recurring::GeneratedTaskInput>, String> {
    Ok(recurring::generate_tasks_from_recurring_plan(&recurring_plan))
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            _ => c,
        })
        .collect::<String>()
        .trim()
        .to_string()
}

/// Focus Mode 상태를 IPC 서버에 알림 (Chrome Extension 연동)
#[tauri::command]
async fn notify_focus_state(
    state: State<'_, IpcState>,
    is_active: bool,
    blocked_urls: Vec<String>,
    elapsed_seconds: u32,
    timer_seconds: u32,
    timer_type: String,
) -> Result<(), String> {
    let focus_state = ipc_server::FocusState {
        is_active,
        blocked_urls,
        elapsed_seconds,
        timer_seconds,
        timer_type,
    };

    state.0.update_state(focus_state).await;
    Ok(())
}

/// Chrome Extension에서 온 명령 폴링 (프론트엔드에서 주기적으로 호출)
#[tauri::command]
async fn poll_extension_command(
    state: State<'_, IpcState>,
) -> Result<Option<ipc_server::ExtensionFocusCommand>, String> {
    Ok(state.0.take_pending_command().await)
}

fn format_shortcut(shortcut: &Shortcut) -> String {
    let mut parts = Vec::new();
    let mods = shortcut.mods;
    if mods.contains(Modifiers::SUPER) {
        parts.push("Cmd");
    }
    if mods.contains(Modifiers::ALT) {
        parts.push("Alt");
    }
    if mods.contains(Modifiers::CONTROL) {
        parts.push("Ctrl");
    }
    if mods.contains(Modifiers::SHIFT) {
        parts.push("Shift");
    }

    let key = match shortcut.key {
        Code::Space => "Space",
        Code::KeyA => "A",
        Code::KeyB => "B",
        Code::KeyC => "C",
        Code::KeyD => "D",
        Code::KeyE => "E",
        Code::KeyF => "F",
        Code::KeyG => "G",
        Code::KeyH => "H",
        Code::KeyI => "I",
        Code::KeyJ => "J",
        Code::KeyK => "K",
        Code::KeyL => "L",
        Code::KeyM => "M",
        Code::KeyN => "N",
        Code::KeyO => "O",
        Code::KeyP => "P",
        Code::KeyQ => "Q",
        Code::KeyR => "R",
        Code::KeyS => "S",
        Code::KeyT => "T",
        Code::KeyU => "U",
        Code::KeyV => "V",
        Code::KeyW => "W",
        Code::KeyX => "X",
        Code::KeyY => "Y",
        Code::KeyZ => "Z",
        _ => "?",
    };
    parts.push(key);

    parts.join("+")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Default shortcut: Alt+Shift+Space
    let default_shortcut = Shortcut::new(Some(Modifiers::ALT | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:schedule.db", get_migrations())
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_window(app);
                    }
                })
                .build(),
        )
        .manage(CurrentShortcut(Mutex::new(default_shortcut.clone())))
        .manage(ApiKeyState(Mutex::new(None)))
        .manage(IpcState(Arc::new(IpcServerState::new())))
        .manage(OAuthState::new())
        .setup(move |app| {
            // Register default shortcut: Alt+Shift+Space
            app.global_shortcut().register(default_shortcut)?;

            // 닫기 동작 변경 (종료 → 숨김)
            setup_close_behavior(app.handle());

            // 시스템 트레이 설정
            if let Err(e) = setup_tray(app.handle()) {
                eprintln!("Failed to setup tray: {}", e);
            }

            // IPC 서버 시작 (Chrome Extension 연동)
            let ipc_state = app.state::<IpcState>().0.clone();
            let app_handle = app.handle().clone();

            // AppHandle을 IpcServerState에 설정하고 IPC 서버 시작
            // Tauri의 async runtime에서 실행하여 emit이 제대로 작동하도록 함
            tauri::async_runtime::spawn(async move {
                ipc_state.set_app_handle(app_handle).await;
                println!("AppHandle set for IPC server");

                if let Err(e) = ipc_server::start_ipc_server(ipc_state).await {
                    eprintln!("IPC server error: {}", e);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::llm::process_with_llm,
            commands::llm::parse_plan,
            commands::llm::generate_daily_tasks,
            commands::llm::split_task,
            get_current_shortcut,
            set_shortcut,
            get_api_key,
            set_api_key,
            delete_api_key,
            validate_api_key,
            get_plan_rules,
            set_plan_rules,
            // Tab shortcuts
            get_tab_shortcuts,
            set_tab_shortcuts,
            // AI input mode shortcut
            get_ai_input_shortcut,
            set_ai_input_shortcut,
            // Focus input shortcut
            get_focus_input_shortcut,
            set_focus_input_shortcut,
            // Language settings
            get_system_locale,
            get_language,
            set_language,
            split_task_with_ai,
            parse_task_with_ai,
            parse_plan_with_ai,
            generate_daily_tasks_with_ai,
            // Export/Import
            export_plan_to_markdown,
            export_tasks_to_markdown,
            export_all_to_json,
            export_to_folder,
            import_from_json,
            import_plan_from_markdown,
            import_tasks_from_markdown,
            // Progress tracking
            calculate_daily_progress,
            get_heatmap_data,
            calculate_streak,
            // Recurring plans
            parse_recurrence_pattern,
            parse_recurrence_pattern_with_ai,
            generate_tasks_preview,
            // Focus mode
            focus::get_running_apps_command,
            focus::get_installed_apps_command,
            focus::get_frontmost_app_command,
            focus::activate_app_command,
            focus::terminate_app_command,
            // IPC (Chrome Extension 연동)
            notify_focus_state,
            poll_extension_command,
            // Google OAuth
            google_auth::get_google_auth_url,
            google_auth::exchange_google_code,
            google_auth::get_google_connection_status,
            google_auth::get_google_access_token,
            google_auth::disconnect_google,
            google_auth::revoke_google_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
