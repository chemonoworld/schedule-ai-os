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
    use objc2_app_kit::{NSApplicationActivationPolicy, NSRunningApplication, NSWorkspace};
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

#[cfg(target_os = "linux")]
mod linux {
    use super::RunningApp;
    use nix::sys::signal::{kill, Signal};
    use nix::unistd::Pid;
    use procfs::process::all_processes;
    use std::collections::HashMap;
    use std::fs;
    use std::path::Path;
    use std::process::Command;

    /// 현재 세션이 Wayland인지 확인
    fn is_wayland() -> bool {
        std::env::var("WAYLAND_DISPLAY").is_ok()
            || std::env::var("XDG_SESSION_TYPE")
                .map(|v| v == "wayland")
                .unwrap_or(false)
    }

    /// /usr/share/applications 및 ~/.local/share/applications에서 .desktop 파일 파싱
    pub fn get_installed_apps() -> Vec<RunningApp> {
        let mut apps = Vec::new();
        let mut seen = std::collections::HashSet::new();

        // 시스템 앱
        if let Ok(entries) = fs::read_dir("/usr/share/applications") {
            for entry in entries.flatten() {
                if let Some(app) = parse_desktop_file(&entry.path()) {
                    if seen.insert(app.bundle_id.clone()) {
                        apps.push(app);
                    }
                }
            }
        }

        // 사용자 앱
        if let Some(home) = std::env::var_os("HOME") {
            let user_apps = Path::new(&home).join(".local/share/applications");
            if let Ok(entries) = fs::read_dir(user_apps) {
                for entry in entries.flatten() {
                    if let Some(app) = parse_desktop_file(&entry.path()) {
                        if seen.insert(app.bundle_id.clone()) {
                            apps.push(app);
                        }
                    }
                }
            }
        }

        // Flatpak 앱
        if let Ok(entries) = fs::read_dir("/var/lib/flatpak/exports/share/applications") {
            for entry in entries.flatten() {
                if let Some(app) = parse_desktop_file(&entry.path()) {
                    if seen.insert(app.bundle_id.clone()) {
                        apps.push(app);
                    }
                }
            }
        }

        // Snap 앱
        if let Ok(entries) = fs::read_dir("/var/lib/snapd/desktop/applications") {
            for entry in entries.flatten() {
                if let Some(app) = parse_desktop_file(&entry.path()) {
                    if seen.insert(app.bundle_id.clone()) {
                        apps.push(app);
                    }
                }
            }
        }

        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        apps
    }

    /// .desktop 파일 파싱
    fn parse_desktop_file(path: &Path) -> Option<RunningApp> {
        let extension = path.extension()?.to_str()?;
        if extension != "desktop" {
            return None;
        }

        let content = fs::read_to_string(path).ok()?;
        let mut name = None;
        let mut exec = None;
        let mut no_display = false;

        for line in content.lines() {
            let line = line.trim();
            if line.starts_with("Name=") && name.is_none() {
                name = Some(line.strip_prefix("Name=")?.to_string());
            } else if line.starts_with("Exec=") && exec.is_none() {
                // Exec에서 실행 파일 이름 추출 (인자 제외)
                let exec_value = line.strip_prefix("Exec=")?;
                let binary = exec_value.split_whitespace().next()?;
                // 경로에서 바이너리 이름만 추출
                exec = Some(Path::new(binary).file_name()?.to_str()?.to_string());
            } else if line.starts_with("NoDisplay=true") {
                no_display = true;
            }
        }

        // NoDisplay=true인 앱은 제외
        if no_display {
            return None;
        }

        let name = name?;
        let bundle_id = exec.unwrap_or_else(|| {
            // .desktop 파일 이름을 bundle_id로 사용
            path.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("")
                .to_string()
        });

        if bundle_id.is_empty() || name.is_empty() {
            return None;
        }

        Some(RunningApp { bundle_id, name })
    }

    /// 실행 중인 프로세스 목록 (GUI 앱 위주)
    pub fn get_running_apps() -> Vec<RunningApp> {
        let mut apps = Vec::new();
        let mut seen = std::collections::HashSet::new();

        // 설치된 앱의 실행 파일 이름 매핑 (bundle_id -> name)
        let installed = get_installed_apps();
        let app_names: HashMap<String, String> = installed
            .into_iter()
            .map(|app| (app.bundle_id.to_lowercase(), app.name))
            .collect();

        if let Ok(processes) = all_processes() {
            for process in processes.flatten() {
                if let Ok(stat) = process.stat() {
                    let comm = stat.comm.to_lowercase();

                    // 설치된 앱 목록에 있는 프로세스만 포함
                    if let Some(name) = app_names.get(&comm) {
                        if seen.insert(comm.clone()) {
                            apps.push(RunningApp {
                                bundle_id: comm,
                                name: name.clone(),
                            });
                        }
                    }
                }
            }
        }

        apps.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        apps
    }

    /// 현재 활성 창의 프로세스 정보 가져오기 (X11 + Wayland 지원)
    pub fn get_frontmost_app() -> Option<RunningApp> {
        if is_wayland() {
            get_frontmost_app_wayland()
        } else {
            get_frontmost_app_x11()
        }
    }

    /// Wayland: gdbus를 통해 GNOME Shell 또는 KDE에서 활성 창 정보 가져오기
    fn get_frontmost_app_wayland() -> Option<RunningApp> {
        // 방법 1: GNOME Shell D-Bus 인터페이스 사용
        if let Some(app) = get_frontmost_app_gnome() {
            return Some(app);
        }

        // 방법 2: KDE KWin D-Bus 인터페이스 사용
        if let Some(app) = get_frontmost_app_kde() {
            return Some(app);
        }

        // 방법 3: XWayland를 통한 X11 fallback (일부 앱은 XWayland에서 실행)
        if std::env::var("DISPLAY").is_ok() {
            if let Some(app) = get_frontmost_app_x11() {
                return Some(app);
            }
        }

        None
    }

    /// GNOME Shell에서 활성 앱 가져오기
    fn get_frontmost_app_gnome() -> Option<RunningApp> {
        // gdbus를 통해 GNOME Shell의 활성 앱 ID 가져오기
        let output = Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest",
                "org.gnome.Shell",
                "--object-path",
                "/org/gnome/Shell",
                "--method",
                "org.gnome.Shell.Eval",
                "global.display.focus_window ? global.display.focus_window.get_wm_class() : ''",
            ])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        // 출력 형식: (true, "'wm_class_name'")
        let wm_class = stdout.split('\'').nth(1)?.to_lowercase();

        if wm_class.is_empty() {
            return None;
        }

        // 설치된 앱에서 이름 찾기
        let installed = get_installed_apps();
        let name = installed
            .iter()
            .find(|app| app.bundle_id.to_lowercase() == wm_class)
            .map(|app| app.name.clone())
            .unwrap_or_else(|| wm_class.clone());

        Some(RunningApp {
            bundle_id: wm_class,
            name,
        })
    }

    /// KDE Plasma에서 활성 앱 가져오기
    fn get_frontmost_app_kde() -> Option<RunningApp> {
        // KWin D-Bus를 통해 활성 창 정보 가져오기
        let output = Command::new("gdbus")
            .args([
                "call",
                "--session",
                "--dest",
                "org.kde.KWin",
                "--object-path",
                "/KWin",
                "--method",
                "org.kde.KWin.activeWindow",
            ])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        // gdbus 성공 시 qdbus로 상세 정보 조회
        let output = Command::new("qdbus")
            .args(["org.kde.KWin", "/KWin", "org.kde.KWin.activeWindow"])
            .output()
            .ok()?;

        if !output.status.success() {
            // qdbus도 실패하면 None
            return None;
        }

        let window_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if window_id.is_empty() {
            return None;
        }

        // 창 ID로 리소스 클래스 가져오기
        let output = Command::new("qdbus")
            .args([
                "org.kde.KWin",
                &format!("/{}", window_id),
                "org.kde.KWin.Window.resourceClass",
            ])
            .output()
            .ok()?;

        let resource_class = String::from_utf8_lossy(&output.stdout)
            .trim()
            .to_lowercase();

        if resource_class.is_empty() {
            return None;
        }

        // 설치된 앱에서 이름 찾기
        let installed = get_installed_apps();
        let name = installed
            .iter()
            .find(|app| app.bundle_id.to_lowercase() == resource_class)
            .map(|app| app.name.clone())
            .unwrap_or_else(|| resource_class.clone());

        Some(RunningApp {
            bundle_id: resource_class,
            name,
        })
    }

    /// X11을 통해 현재 활성 창의 프로세스 정보 가져오기
    fn get_frontmost_app_x11() -> Option<RunningApp> {
        use x11rb::connection::Connection;
        use x11rb::protocol::xproto::{AtomEnum, ConnectionExt};

        // X11 연결
        let (conn, screen_num) = x11rb::connect(None).ok()?;
        let screen = &conn.setup().roots[screen_num];
        let root = screen.root;

        // _NET_ACTIVE_WINDOW atom 가져오기
        let active_window_atom = conn
            .intern_atom(false, b"_NET_ACTIVE_WINDOW")
            .ok()?
            .reply()
            .ok()?
            .atom;

        // 활성 창 ID 가져오기
        let reply = conn
            .get_property(false, root, active_window_atom, AtomEnum::WINDOW, 0, 1)
            .ok()?
            .reply()
            .ok()?;

        if reply.value.len() < 4 {
            return None;
        }

        let window_id = u32::from_ne_bytes([
            reply.value[0],
            reply.value[1],
            reply.value[2],
            reply.value[3],
        ]);

        if window_id == 0 {
            return None;
        }

        // _NET_WM_PID atom으로 PID 가져오기
        let pid_atom = conn
            .intern_atom(false, b"_NET_WM_PID")
            .ok()?
            .reply()
            .ok()?
            .atom;

        let pid_reply = conn
            .get_property(false, window_id, pid_atom, AtomEnum::CARDINAL, 0, 1)
            .ok()?
            .reply()
            .ok()?;

        if pid_reply.value.len() < 4 {
            return None;
        }

        let pid = u32::from_ne_bytes([
            pid_reply.value[0],
            pid_reply.value[1],
            pid_reply.value[2],
            pid_reply.value[3],
        ]);

        // PID로 프로세스 이름 가져오기
        let process = procfs::process::Process::new(pid as i32).ok()?;
        let stat = process.stat().ok()?;
        let comm = stat.comm.to_lowercase();

        // 설치된 앱에서 이름 찾기
        let installed = get_installed_apps();
        let name = installed
            .iter()
            .find(|app| app.bundle_id.to_lowercase() == comm)
            .map(|app| app.name.clone())
            .unwrap_or_else(|| stat.comm.clone());

        Some(RunningApp {
            bundle_id: comm,
            name,
        })
    }

    /// 앱 활성화 (Tauri 창만 활성화 - 실제 구현은 Tauri API 사용)
    pub fn activate_our_app() {
        // Linux에서는 Tauri의 window.show() + set_focus()로 처리
        // 이 함수는 Tauri command에서 호출됨
    }

    /// 프로세스 이름으로 앱 종료
    pub fn terminate_app_by_bundle_id(bundle_id: &str) -> bool {
        let bundle_id_lower = bundle_id.to_lowercase();
        let mut terminated = false;

        if let Ok(processes) = all_processes() {
            for process in processes.flatten() {
                let pid = process.pid();

                // 방법 1: /proc/[pid]/comm 확인 (최대 15자)
                let comm_match = process
                    .stat()
                    .map(|stat| stat.comm.to_lowercase() == bundle_id_lower)
                    .unwrap_or(false);

                // 방법 2: /proc/[pid]/cmdline 확인 (전체 명령어)
                let cmdline_match = process
                    .cmdline()
                    .map(|cmdline| {
                        if let Some(first_arg) = cmdline.first() {
                            // 실행 파일 경로에서 바이너리 이름 추출
                            let binary_name = Path::new(first_arg)
                                .file_name()
                                .and_then(|s| s.to_str())
                                .unwrap_or("")
                                .to_lowercase();
                            binary_name == bundle_id_lower
                                || binary_name.starts_with(&format!("{}-", bundle_id_lower))
                        } else {
                            false
                        }
                    })
                    .unwrap_or(false);

                if comm_match || cmdline_match {
                    let pid_nix = Pid::from_raw(pid);
                    // SIGTERM으로 graceful 종료 시도
                    match kill(pid_nix, Signal::SIGTERM) {
                        Ok(_) => {
                            terminated = true;
                            eprintln!("[focus] Terminated process {} (pid: {})", bundle_id, pid);
                        }
                        Err(e) => {
                            eprintln!(
                                "[focus] Failed to terminate {} (pid: {}): {:?}",
                                bundle_id, pid, e
                            );
                            // 권한 문제일 경우 pkill 시도
                            if let nix::errno::Errno::EPERM = e {
                                if Command::new("pkill")
                                    .args(["-TERM", "-x", &bundle_id_lower])
                                    .status()
                                    .map(|s| s.success())
                                    .unwrap_or(false)
                                {
                                    terminated = true;
                                    eprintln!("[focus] Terminated via pkill: {}", bundle_id);
                                }
                            }
                        }
                    }
                }
            }
        }

        // 직접 kill이 실패했다면 pkill로 재시도
        if !terminated {
            if Command::new("pkill")
                .args(["-TERM", "-i", &bundle_id_lower])
                .status()
                .map(|s| s.success())
                .unwrap_or(false)
            {
                terminated = true;
                eprintln!("[focus] Terminated via pkill fallback: {}", bundle_id);
            }
        }

        terminated
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "linux")))]
mod fallback {
    use super::RunningApp;

    pub fn activate_our_app() {
        // No-op on unsupported platforms
    }

    pub fn get_running_apps() -> Vec<RunningApp> {
        Vec::new()
    }

    pub fn get_installed_apps() -> Vec<RunningApp> {
        Vec::new()
    }

    pub fn get_frontmost_app() -> Option<RunningApp> {
        None
    }

    pub fn terminate_app_by_bundle_id(_bundle_id: &str) -> bool {
        false
    }
}

#[cfg(target_os = "macos")]
pub use macos::*;

#[cfg(target_os = "linux")]
pub use linux::*;

#[cfg(all(not(target_os = "macos"), not(target_os = "linux")))]
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
