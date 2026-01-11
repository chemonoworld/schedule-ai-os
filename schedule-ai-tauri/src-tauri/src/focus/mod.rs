use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunningApp {
    pub bundle_id: String,
    pub name: String,
}

#[cfg(target_os = "macos")]
mod macos {
    use super::RunningApp;
    use objc2_app_kit::{NSApplicationActivationPolicy, NSWorkspace, NSRunningApplication};
    use std::path::Path;
    use std::process::Command;

    /// 설치된 앱 목록 가져오기 (/Applications, ~/Applications 스캔)
    pub fn get_installed_apps() -> Vec<RunningApp> {
        let mut apps = Vec::new();

        // /Applications 폴더 스캔
        if let Ok(entries) = std::fs::read_dir("/Applications") {
            for entry in entries.flatten() {
                if let Some(app) = parse_app_bundle(&entry.path()) {
                    apps.push(app);
                }
            }
        }

        // ~/Applications 폴더 스캔
        if let Some(home) = std::env::var_os("HOME") {
            let user_apps = Path::new(&home).join("Applications");
            if let Ok(entries) = std::fs::read_dir(user_apps) {
                for entry in entries.flatten() {
                    if let Some(app) = parse_app_bundle(&entry.path()) {
                        apps.push(app);
                    }
                }
            }
        }

        // 이름순 정렬
        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        apps
    }

    /// .app 번들에서 bundle_id와 이름 추출
    fn parse_app_bundle(path: &Path) -> Option<RunningApp> {
        let extension = path.extension()?.to_str()?;
        if extension != "app" {
            return None;
        }

        let name = path.file_stem()?.to_str()?.to_string();
        let plist_path = path.join("Contents/Info.plist");

        // plistutil 또는 defaults 명령어로 bundle ID 읽기
        let bundle_id = read_bundle_id(&plist_path).unwrap_or_default();

        if bundle_id.is_empty() {
            return None;
        }

        Some(RunningApp { bundle_id, name })
    }

    /// Info.plist에서 CFBundleIdentifier 읽기
    fn read_bundle_id(plist_path: &Path) -> Option<String> {
        let output = Command::new("defaults")
            .args(["read", plist_path.to_str()?, "CFBundleIdentifier"])
            .output()
            .ok()?;

        if output.status.success() {
            Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
        } else {
            None
        }
    }

    pub fn get_running_apps() -> Vec<RunningApp> {
        unsafe {
            let workspace = NSWorkspace::sharedWorkspace();
            let apps = workspace.runningApplications();

            let mut result = Vec::new();
            let count = apps.count();
            for i in 0..count {
                let app = apps.objectAtIndex(i);
                // 일반 앱만 포함 (백그라운드 프로세스 제외)
                if app.activationPolicy() == NSApplicationActivationPolicy::Regular {
                    let bundle_id = app
                        .bundleIdentifier()
                        .map(|s| s.to_string())
                        .unwrap_or_default();

                    let name = app
                        .localizedName()
                        .map(|s| s.to_string())
                        .unwrap_or_default();

                    if !bundle_id.is_empty() && !name.is_empty() {
                        result.push(RunningApp { bundle_id, name });
                    }
                }
            }
            result
        }
    }

    pub fn get_frontmost_app() -> Option<RunningApp> {
        unsafe {
            let workspace = NSWorkspace::sharedWorkspace();
            let app = workspace.frontmostApplication()?;

            let bundle_id = app.bundleIdentifier()?.to_string();
            let name = app.localizedName()?.to_string();

            Some(RunningApp { bundle_id, name })
        }
    }

    /// Bring our app to front and activate it
    pub fn activate_our_app() {
        use cocoa::appkit::{NSApp, NSApplication};
        use cocoa::base::YES;

        unsafe {
            let app = NSApp();
            // Force activate our app, ignoring other apps
            app.activateIgnoringOtherApps_(YES);
        }
    }

    /// Terminate an app by bundle ID
    /// Returns true if the app was found and terminate was requested
    pub fn terminate_app_by_bundle_id(bundle_id: &str) -> bool {
        unsafe {
            let workspace = NSWorkspace::sharedWorkspace();
            let apps = workspace.runningApplications();

            let count = apps.count();
            for i in 0..count {
                let app = apps.objectAtIndex(i);
                if let Some(app_bundle_id) = app.bundleIdentifier() {
                    if app_bundle_id.to_string() == bundle_id {
                        // Try graceful terminate first
                        let terminated = app.terminate();
                        if !terminated {
                            // Force terminate if graceful didn't work
                            app.forceTerminate();
                        }
                        return true;
                    }
                }
            }
            false
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod fallback {
    use super::RunningApp;

    pub fn activate_our_app() {
        // No-op on non-macOS
    }

    pub fn get_running_apps() -> Vec<RunningApp> {
        // Non-macOS: return empty list
        Vec::new()
    }

    pub fn get_installed_apps() -> Vec<RunningApp> {
        // Non-macOS: return empty list
        Vec::new()
    }

    pub fn get_frontmost_app() -> Option<RunningApp> {
        // Non-macOS: return None
        None
    }

    pub fn terminate_app_by_bundle_id(_bundle_id: &str) -> bool {
        // Non-macOS: not supported
        false
    }
}

#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(not(target_os = "macos"))]
pub use fallback::*;

// Tauri commands
#[tauri::command]
pub fn get_running_apps_command() -> Vec<RunningApp> {
    get_running_apps()
}

#[tauri::command]
pub async fn get_installed_apps_command() -> Vec<RunningApp> {
    // 백그라운드 스레드에서 실행하여 UI 블로킹 방지
    tokio::task::spawn_blocking(get_installed_apps)
        .await
        .unwrap_or_default()
}

#[tauri::command]
pub fn get_frontmost_app_command() -> Option<RunningApp> {
    get_frontmost_app()
}

#[tauri::command]
pub fn activate_app_command(app: AppHandle) {
    // macOS: Force activate our app
    activate_our_app();

    // Also bring window to front via Tauri API
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

// App termination command
#[tauri::command]
pub fn terminate_app_command(bundle_id: String) -> bool {
    terminate_app_by_bundle_id(&bundle_id)
}
