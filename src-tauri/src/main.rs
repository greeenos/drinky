// Drinky desktop: a tray icon that follows the Drinky server over SSE and
// covers every monitor with the server's overlay page while a reminder is due.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::{fs, path::PathBuf, thread, time::Duration};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, Wry};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

fn config_file(app: &AppHandle) -> PathBuf {
    app.path().app_config_dir().expect("config dir").join("server.txt")
}

fn server_url(app: &AppHandle) -> String {
    let url = fs::read_to_string(config_file(app)).unwrap_or_default();
    url.trim().trim_end_matches('/').to_string()
}

#[tauri::command]
fn get_server(app: AppHandle) -> String {
    server_url(&app)
}

#[tauri::command]
fn set_server(app: AppHandle, url: String) -> Result<(), String> {
    let path = config_file(&app);
    fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    fs::write(path, url.trim()).map_err(|e| e.to_string())?;
    app.restart()
}

fn post(base: String, action: &'static str) {
    thread::spawn(move || {
        let _ = ureq::post(&format!("{base}/api/{action}")).call();
    });
}

fn open_window(app: &AppHandle, label: &str, url: WebviewUrl, w: f64, h: f64) {
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, label, url)
        .title("Drinky")
        .inner_size(w, h)
        .build();
}

fn show_overlay(app: &AppHandle, base: &str) {
    let Ok(url) = format!("{base}/?overlay=1").parse::<tauri::Url>() else { return };
    for (i, monitor) in app.available_monitors().unwrap_or_default().iter().enumerate() {
        let label = format!("overlay{i}");
        if app.get_webview_window(&label).is_some() {
            continue;
        }
        let Ok(win) = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url.clone()))
            .title("Drinky")
            .decorations(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .visible_on_all_workspaces(true)
            .resizable(false)
            .visible(false)
            .build()
        else {
            continue;
        };
        let _ = win.set_position(*monitor.position());
        // Windows: borderless fullscreen on that monitor (a raw physical
        // set_size mis-scales the page at 150% DPI). macOS: plain cover, since
        // fullscreen there would open a separate Space.
        if cfg!(target_os = "macos") {
            let _ = win.set_size(*monitor.size());
        } else {
            let _ = win.set_fullscreen(true);
        }
        let _ = win.show();
        if i == 0 {
            let _ = win.set_focus();
        }
    }
}

fn hide_overlay(app: &AppHandle) {
    for (label, win) in app.webview_windows() {
        if label.starts_with("overlay") {
            let _ = win.close();
        }
    }
}

// Follow the server's SSE stream forever; the server pings every 25s, so a
// silent minute means a dead connection and we reconnect.
fn listen(app: AppHandle, base: String, today: MenuItem<Wry>) {
    let agent = ureq::AgentBuilder::new()
        .timeout_read(Duration::from_secs(60))
        .build();
    let mut active = false;
    loop {
        if let Ok(res) = agent.get(&format!("{base}/api/events")).call() {
            for line in BufReader::new(res.into_reader()).lines() {
                let Ok(line) = line else { break };
                let Some(data) = line.strip_prefix("data: ") else { continue };
                let Ok(st) = serde_json::from_str::<serde_json::Value>(data) else { continue };
                let drank = st["drankMl"].as_f64().unwrap_or(0.0) / 1000.0;
                let goal = st["settings"]["dailyGoalMl"].as_f64().unwrap_or(0.0) / 1000.0;
                let _ = today.set_text(format!("Today: {drank:.1} / {goal:.1} L"));
                let now = st["active"].as_bool().unwrap_or(false);
                if now != active {
                    active = now;
                    if now {
                        show_overlay(&app, &base);
                    } else {
                        hide_overlay(&app);
                    }
                }
            }
        }
        let _ = today.set_text("Offline, reconnecting…");
        thread::sleep(Duration::from_secs(5));
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .invoke_handler(tauri::generate_handler![get_server, set_server])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            let base = server_url(&handle);
            let autostart = app.autolaunch();
            if base.is_empty() {
                let _ = autostart.enable(); // first run: start at login by default
            }

            let none = None::<&str>;
            let today = MenuItem::with_id(app, "today", "Today: –", false, none)?;
            let login = CheckMenuItem::with_id(
                app,
                "login",
                "Start at login",
                true,
                autostart.is_enabled().unwrap_or(false),
                none,
            )?;
            let menu = Menu::with_items(
                app,
                &[
                    &today,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "drink", "I drank a glass", true, none)?,
                    &MenuItem::with_id(app, "remind", "Remind everywhere now", true, none)?,
                    &MenuItem::with_id(app, "open", "Open Drinky", true, none)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "server", "Server…", true, none)?,
                    &login,
                    &MenuItem::with_id(app, "quit", "Quit", true, none)?,
                ],
            )?;

            let login_item = login.clone();
            TrayIconBuilder::new()
                .icon(app.default_window_icon().expect("icon").clone())
                .tooltip("Drinky")
                .menu(&menu)
                .show_menu_on_left_click(true)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "drink" => post(server_url(app), "drink"),
                    "remind" => post(server_url(app), "remind"),
                    "open" => {
                        if let Ok(url) = server_url(app).parse() {
                            open_window(app, "main", WebviewUrl::External(url), 480.0, 760.0);
                        }
                    }
                    "server" => open_window(app, "settings", WebviewUrl::default(), 420.0, 260.0),
                    "login" => {
                        let auto = app.autolaunch();
                        let on = auto.is_enabled().unwrap_or(false);
                        let _ = if on { auto.disable() } else { auto.enable() };
                        let _ = login_item.set_checked(!on);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            if base.is_empty() {
                let _ = today.set_text("No server set");
                open_window(&handle, "settings", WebviewUrl::default(), 420.0, 260.0);
            } else {
                thread::spawn(move || listen(handle, base, today));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Drinky")
        .run(|_, event| {
            // Live in the tray: closing the last window must not quit.
            if let RunEvent::ExitRequested { api, code: None, .. } = event {
                api.prevent_exit();
            }
        });
}
