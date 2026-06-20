use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::{env, net::TcpStream};

use tauri::Emitter;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

static DESKTOP_WINDOW_MODE: OnceLock<Mutex<String>> = OnceLock::new();
static HOLD_TO_TALK_CAPTURE: OnceLock<Mutex<HoldToTalkCapture>> = OnceLock::new();
static REGISTERED_HOLD_TO_TALK_HOTKEY: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static BACKEND_PROCESS: OnceLock<Mutex<BackendProcessState>> = OnceLock::new();

const HOLD_TO_TALK_HOTKEY_EVENT: &str = "honey://hold-to-talk-hotkey";
const DEFAULT_BACKEND_HOST: &str = "127.0.0.1";
const DEFAULT_BACKEND_PORT: u16 = 33577;

#[derive(Clone)]
struct HoldToTalkCapture {
    state: String,
    hotkey: String,
    audio_path: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct BackendProcessConfig {
    executable: String,
    args: Vec<String>,
    cwd: String,
    host: String,
    port: u16,
}

impl BackendProcessConfig {
    fn base_url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }
}

#[derive(Default)]
struct BackendProcessState {
    child: Option<Child>,
    external_running: bool,
    detail: Option<String>,
}

fn desktop_window_mode() -> &'static Mutex<String> {
    DESKTOP_WINDOW_MODE.get_or_init(|| Mutex::new("full".to_string()))
}

fn hold_to_talk_capture() -> &'static Mutex<HoldToTalkCapture> {
    HOLD_TO_TALK_CAPTURE.get_or_init(|| {
        Mutex::new(HoldToTalkCapture {
            state: "cancelled".to_string(),
            hotkey: "CapsLock".to_string(),
            audio_path: None,
        })
    })
}

fn registered_hold_to_talk_hotkey() -> &'static Mutex<Option<String>> {
    REGISTERED_HOLD_TO_TALK_HOTKEY.get_or_init(|| Mutex::new(None))
}

fn backend_process_state() -> &'static Mutex<BackendProcessState> {
    BACKEND_PROCESS.get_or_init(|| Mutex::new(BackendProcessState::default()))
}

fn shortcut_state_name(state: ShortcutState) -> &'static str {
    match state {
        ShortcutState::Pressed => "pressed",
        ShortcutState::Released => "released",
    }
}

fn default_backend_base_url() -> String {
    let cwd = env::current_dir()
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_else(|_| ".".to_string());
    let env_pairs = current_backend_env_pairs();

    resolve_backend_process_config_from_pairs(&env_pairs, &cwd)
        .map(|config| config.base_url())
        .unwrap_or_else(|_| format!("http://{}:{}", DEFAULT_BACKEND_HOST, DEFAULT_BACKEND_PORT))
}

fn current_backend_env_pairs() -> Vec<(String, String)> {
    env::vars()
        .filter(|(key, _)| key.starts_with("HONEY_BACKEND_"))
        .collect()
}

fn env_pair_value(env_pairs: &[(String, String)], key: &str) -> Option<String> {
    env_pairs
        .iter()
        .find(|(current_key, _)| current_key == key)
        .map(|(_, value)| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn parse_backend_args(input: &str) -> Result<Vec<String>, String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;

    for character in input.chars() {
        match (character, quote) {
            ('"' | '\'', None) => quote = Some(character),
            (candidate, Some(active_quote)) if candidate == active_quote => quote = None,
            (candidate, None) if candidate.is_whitespace() => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            (candidate, _) => current.push(candidate),
        }
    }

    if quote.is_some() {
        return Err("backend_args_unclosed_quote".to_string());
    }

    if !current.is_empty() {
        args.push(current);
    }

    Ok(args)
}

fn resolve_current_backend_sidecar_executable() -> Option<String> {
    let executable_name = if cfg!(windows) {
        "honey-backend.exe"
    } else {
        "honey-backend"
    };
    let current_exe = env::current_exe().ok()?;
    let sidecar_path = current_exe.parent()?.join(executable_name);

    sidecar_path
        .is_file()
        .then(|| sidecar_path.to_string_lossy().into_owned())
}

fn sidecar_working_directory(sidecar_executable: &str, fallback_cwd: &str) -> String {
    Path::new(sidecar_executable)
        .parent()
        .map(|path| path.to_string_lossy().into_owned())
        .filter(|path| !path.is_empty())
        .unwrap_or_else(|| fallback_cwd.to_string())
}

fn resolve_backend_process_config_from_pairs_with_sidecar(
    env_pairs: &[(String, String)],
    fallback_cwd: &str,
    sidecar_executable: Option<&str>,
) -> Result<BackendProcessConfig, String> {
    let has_executable_override = env_pair_value(env_pairs, "HONEY_BACKEND_EXECUTABLE").is_some();
    let executable = env_pair_value(env_pairs, "HONEY_BACKEND_EXECUTABLE")
        .or_else(|| sidecar_executable.map(str::to_string))
        .unwrap_or_else(|| {
            if cfg!(windows) {
                "pnpm.cmd".to_string()
            } else {
                "pnpm".to_string()
            }
        });
    let args = if let Some(raw_args) = env_pair_value(env_pairs, "HONEY_BACKEND_ARGS") {
        parse_backend_args(&raw_args)?
    } else if has_executable_override || sidecar_executable.is_some() {
        Vec::new()
    } else {
        vec!["--filter".to_string(), "backend".to_string(), "dev".to_string()]
    };
    let cwd = env_pair_value(env_pairs, "HONEY_BACKEND_CWD")
        .unwrap_or_else(|| {
            sidecar_executable
                .map(|path| sidecar_working_directory(path, fallback_cwd))
                .unwrap_or_else(|| fallback_cwd.to_string())
        });
    let host = env_pair_value(env_pairs, "HONEY_BACKEND_HOST")
        .unwrap_or_else(|| DEFAULT_BACKEND_HOST.to_string());
    let port = env_pair_value(env_pairs, "HONEY_BACKEND_PORT")
        .map(|value| value.parse::<u16>().map_err(|_| "invalid_backend_port".to_string()))
        .transpose()?
        .unwrap_or(DEFAULT_BACKEND_PORT);

    Ok(BackendProcessConfig {
        executable,
        args,
        cwd,
        host,
        port,
    })
}

fn resolve_backend_process_config_from_pairs(
    env_pairs: &[(String, String)],
    fallback_cwd: &str,
) -> Result<BackendProcessConfig, String> {
    resolve_backend_process_config_from_pairs_with_sidecar(
        env_pairs,
        fallback_cwd,
        resolve_current_backend_sidecar_executable().as_deref(),
    )
}

#[cfg(test)]
fn resolve_backend_process_config(
    env_pairs: &[(&str, &str)],
    fallback_cwd: &str,
) -> Result<BackendProcessConfig, String> {
    let owned_pairs = env_pairs
        .iter()
        .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
        .collect::<Vec<_>>();

    resolve_backend_process_config_from_pairs(&owned_pairs, fallback_cwd)
}

#[cfg(test)]
fn resolve_backend_process_config_with_sidecar(
    env_pairs: &[(&str, &str)],
    fallback_cwd: &str,
    sidecar_executable: Option<&str>,
) -> Result<BackendProcessConfig, String> {
    let owned_pairs = env_pairs
        .iter()
        .map(|(key, value)| ((*key).to_string(), (*value).to_string()))
        .collect::<Vec<_>>();

    resolve_backend_process_config_from_pairs_with_sidecar(
        &owned_pairs,
        fallback_cwd,
        sidecar_executable,
    )
}

fn resolve_current_backend_process_config() -> Result<BackendProcessConfig, String> {
    let cwd = env::current_dir()
        .map_err(|error| format!("backend_cwd_unavailable:{error}"))?
        .to_string_lossy()
        .into_owned();
    let env_pairs = current_backend_env_pairs();

    resolve_backend_process_config_from_pairs(&env_pairs, &cwd)
}

fn is_backend_endpoint_available(config: &BackendProcessConfig) -> bool {
    let Ok(address) = format!("{}:{}", config.host, config.port).parse() else {
        return false;
    };

    TcpStream::connect_timeout(&address, Duration::from_millis(200)).is_ok()
}

fn backend_process_status_json(
    status: &str,
    config: &BackendProcessConfig,
    managed: bool,
    pid: Option<u32>,
    detail: Option<String>,
) -> serde_json::Value {
    let mut value = serde_json::json!({
        "ok": true,
        "status": status,
        "baseUrl": config.base_url(),
        "managed": managed,
    });

    if let Some(pid) = pid {
        value["pid"] = serde_json::json!(pid);
    }

    if let Some(detail) = detail {
        value["detail"] = serde_json::json!(detail);
    }

    value
}

fn backend_process_status_from_state(
    state: &mut BackendProcessState,
    config: &BackendProcessConfig,
) -> serde_json::Value {
    if let Some(child) = state.child.as_mut() {
        match child.try_wait() {
            Ok(None) => {
                return backend_process_status_json(
                    "running",
                    config,
                    true,
                    Some(child.id()),
                    state.detail.clone(),
                );
            }
            Ok(Some(status)) => {
                state.child = None;
                state.external_running = false;
                state.detail = Some(format!("backend_exited:{status}"));
            }
            Err(error) => {
                return backend_process_status_json(
                    "error",
                    config,
                    true,
                    Some(child.id()),
                    Some(format!("backend_status_unavailable:{error}")),
                );
            }
        }
    }

    if state.external_running {
        if is_backend_endpoint_available(config) {
            return backend_process_status_json(
                "running",
                config,
                false,
                None,
                state.detail.clone(),
            );
        }

        state.external_running = false;
    }

    backend_process_status_json("stopped", config, true, None, state.detail.clone())
}

fn hold_to_talk_capture_json(capture: &HoldToTalkCapture) -> serde_json::Value {
    let mut value = serde_json::json!({
        "ok": true,
        "state": capture.state,
        "hotkey": capture.hotkey,
    });

    if let Some(audio_path) = &capture.audio_path {
        value["audioPath"] = serde_json::json!(audio_path);
    }

    value
}

fn create_hold_to_talk_audio_file() -> Result<String, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "capture_clock_error".to_string())?
        .as_millis();
    let mut path = std::env::temp_dir();
    path.push("honey");
    path.push("captures");
    std::fs::create_dir_all(&path).map_err(|error| format!("capture_dir_unavailable:{error}"))?;
    path.push(format!("hold-to-talk-{timestamp}.wav"));
    write_empty_wav_file(&path)?;

    Ok(path.to_string_lossy().into_owned())
}

fn write_empty_wav_file(path: &Path) -> Result<(), String> {
    let sample_rate = 16_000u32;
    let channels = 1u16;
    let bits_per_sample = 16u16;
    let data_size = 0u32;
    let byte_rate = sample_rate * u32::from(channels) * u32::from(bits_per_sample) / 8;
    let block_align = channels * bits_per_sample / 8;
    let mut header = Vec::with_capacity(44);

    header.extend_from_slice(b"RIFF");
    header.extend_from_slice(&(36 + data_size).to_le_bytes());
    header.extend_from_slice(b"WAVE");
    header.extend_from_slice(b"fmt ");
    header.extend_from_slice(&16u32.to_le_bytes());
    header.extend_from_slice(&1u16.to_le_bytes());
    header.extend_from_slice(&channels.to_le_bytes());
    header.extend_from_slice(&sample_rate.to_le_bytes());
    header.extend_from_slice(&byte_rate.to_le_bytes());
    header.extend_from_slice(&block_align.to_le_bytes());
    header.extend_from_slice(&bits_per_sample.to_le_bytes());
    header.extend_from_slice(b"data");
    header.extend_from_slice(&data_size.to_le_bytes());

    std::fs::write(path, header).map_err(|error| format!("capture_file_unavailable:{error}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            honey_desktop_capabilities,
            honey_get_backend_process_status,
            honey_start_backend_process,
            honey_stop_backend_process,
            honey_get_desktop_window_mode,
            honey_set_desktop_window_mode,
            honey_register_hold_to_talk_hotkey,
            honey_unregister_hold_to_talk_hotkey,
            honey_start_hold_to_talk_capture,
            honey_finish_hold_to_talk_capture,
            honey_cancel_hold_to_talk_capture,
            honey_insert_text,
            honey_preview_text_insertion,
        ])
        .run(tauri::generate_context!())
        .expect("error while running honey");
}

#[tauri::command]
fn honey_desktop_capabilities() -> serde_json::Value {
    serde_json::json!({
        "backendTransport": "http",
        "backendBaseUrl": default_backend_base_url(),
        "canManageWindow": true,
        "canUseTray": false,
        "canRegisterGlobalHotkey": true,
        "canInsertText": true,
        "canPreviewHoldToTalk": true,
        "canManageBackend": true
    })
}

#[tauri::command]
fn honey_get_backend_process_status() -> serde_json::Value {
    match resolve_current_backend_process_config() {
        Ok(config) => {
            let mut state = backend_process_state()
                .lock()
                .expect("backend process lock poisoned");
            backend_process_status_from_state(&mut state, &config)
        }
        Err(error) => serde_json::json!({
            "ok": true,
            "status": "error",
            "baseUrl": format!("http://{}:{}", DEFAULT_BACKEND_HOST, DEFAULT_BACKEND_PORT),
            "managed": true,
            "detail": error
        }),
    }
}

#[tauri::command]
fn honey_start_backend_process() -> serde_json::Value {
    let config = match resolve_current_backend_process_config() {
        Ok(config) => config,
        Err(error) => {
            return serde_json::json!({
                "ok": true,
                "status": "error",
                "baseUrl": format!("http://{}:{}", DEFAULT_BACKEND_HOST, DEFAULT_BACKEND_PORT),
                "managed": true,
                "detail": error
            });
        }
    };
    let mut state = backend_process_state()
        .lock()
        .expect("backend process lock poisoned");
    let current_status = backend_process_status_from_state(&mut state, &config);
    if current_status["status"] == "running" {
        return current_status;
    }

    if is_backend_endpoint_available(&config) {
        state.external_running = true;
        state.detail = Some("backend_already_running".to_string());
        return backend_process_status_json(
            "running",
            &config,
            false,
            None,
            state.detail.clone(),
        );
    }

    match Command::new(&config.executable)
        .args(&config.args)
        .current_dir(&config.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(child) => {
            let pid = child.id();
            state.child = Some(child);
            state.external_running = false;
            state.detail = None;
            backend_process_status_json("running", &config, true, Some(pid), None)
        }
        Err(error) => {
            state.child = None;
            state.external_running = false;
            state.detail = Some(format!("backend_start_failed:{error}"));
            backend_process_status_json("error", &config, true, None, state.detail.clone())
        }
    }
}

#[tauri::command]
fn honey_stop_backend_process() -> serde_json::Value {
    let config = match resolve_current_backend_process_config() {
        Ok(config) => config,
        Err(error) => {
            return serde_json::json!({
                "ok": true,
                "status": "error",
                "baseUrl": format!("http://{}:{}", DEFAULT_BACKEND_HOST, DEFAULT_BACKEND_PORT),
                "managed": true,
                "detail": error
            });
        }
    };
    let mut state = backend_process_state()
        .lock()
        .expect("backend process lock poisoned");

    if let Some(mut child) = state.child.take() {
        let _ = child.kill();
        let _ = child.wait();
        state.external_running = false;
        state.detail = None;
        return backend_process_status_json("stopped", &config, true, None, None);
    }

    if state.external_running && is_backend_endpoint_available(&config) {
        state.detail = Some("backend_process_not_managed".to_string());
        return backend_process_status_json(
            "running",
            &config,
            false,
            None,
            state.detail.clone(),
        );
    }

    state.external_running = false;
    state.detail = None;
    backend_process_status_json("stopped", &config, true, None, None)
}

#[tauri::command]
fn honey_get_desktop_window_mode() -> serde_json::Value {
    let mode = desktop_window_mode()
        .lock()
        .expect("desktop window mode lock poisoned")
        .clone();

    serde_json::json!({ "mode": mode })
}

#[tauri::command]
fn honey_set_desktop_window_mode(mode: String) -> Result<serde_json::Value, String> {
    if mode != "full" && mode != "mini" {
        return Err("invalid_window_mode".to_string());
    }

    *desktop_window_mode()
        .lock()
        .expect("desktop window mode lock poisoned") = mode.clone();

    Ok(serde_json::json!({
        "ok": true,
        "mode": mode
    }))
}

#[tauri::command]
fn honey_register_hold_to_talk_hotkey(
    app: tauri::AppHandle,
    hotkey: String,
) -> Result<serde_json::Value, String> {
    let normalized_hotkey = hotkey.trim().to_string();
    if normalized_hotkey.is_empty() {
        return Err("invalid_hotkey".to_string());
    }

    let mut registered_hotkey = registered_hold_to_talk_hotkey()
        .lock()
        .expect("registered hold-to-talk hotkey lock poisoned");
    if registered_hotkey.as_ref() == Some(&normalized_hotkey) {
        return Ok(serde_json::json!({
            "ok": true,
            "hotkey": normalized_hotkey,
            "event": HOLD_TO_TALK_HOTKEY_EVENT
        }));
    }

    if let Some(current_hotkey) = registered_hotkey.as_ref() {
        app.global_shortcut()
            .unregister(current_hotkey.as_str())
            .map_err(|error| format!("hotkey_unregister_failed:{error}"))?;
    }

    let hotkey_for_handler = normalized_hotkey.clone();
    app.global_shortcut()
        .on_shortcut(normalized_hotkey.as_str(), move |app, _shortcut, event| {
            let _ = app.emit(
                HOLD_TO_TALK_HOTKEY_EVENT,
                serde_json::json!({
                    "hotkey": hotkey_for_handler,
                    "state": shortcut_state_name(event.state),
                }),
            );
        })
        .map_err(|error| format!("hotkey_register_failed:{error}"))?;

    *registered_hotkey = Some(normalized_hotkey.clone());

    Ok(serde_json::json!({
        "ok": true,
        "hotkey": normalized_hotkey,
        "event": HOLD_TO_TALK_HOTKEY_EVENT
    }))
}

#[tauri::command]
fn honey_unregister_hold_to_talk_hotkey(app: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let mut registered_hotkey = registered_hold_to_talk_hotkey()
        .lock()
        .expect("registered hold-to-talk hotkey lock poisoned");

    if let Some(current_hotkey) = registered_hotkey.as_ref() {
        app.global_shortcut()
            .unregister(current_hotkey.as_str())
            .map_err(|error| format!("hotkey_unregister_failed:{error}"))?;
    }

    let hotkey = registered_hotkey.take();

    Ok(serde_json::json!({
        "ok": true,
        "hotkey": hotkey
    }))
}

#[tauri::command]
fn honey_start_hold_to_talk_capture(hotkey: String) -> Result<serde_json::Value, String> {
    if hotkey.trim().is_empty() {
        return Err("invalid_hotkey".to_string());
    }

    let mut capture = hold_to_talk_capture()
        .lock()
        .expect("hold-to-talk capture lock poisoned");
    capture.state = "listening".to_string();
    capture.hotkey = hotkey;
    capture.audio_path = Some(create_hold_to_talk_audio_file()?);

    Ok(hold_to_talk_capture_json(&capture))
}

#[tauri::command]
fn honey_finish_hold_to_talk_capture() -> Result<serde_json::Value, String> {
    let mut capture = hold_to_talk_capture()
        .lock()
        .expect("hold-to-talk capture lock poisoned");
    if capture.state != "listening" {
        return Err("not_listening".to_string());
    }

    capture.state = "captured".to_string();

    Ok(hold_to_talk_capture_json(&capture))
}

#[tauri::command]
fn honey_cancel_hold_to_talk_capture() -> Result<serde_json::Value, String> {
    let mut capture = hold_to_talk_capture()
        .lock()
        .expect("hold-to-talk capture lock poisoned");
    capture.state = "cancelled".to_string();
    capture.audio_path = None;

    Ok(hold_to_talk_capture_json(&capture))
}

#[tauri::command]
fn honey_preview_text_insertion(text: String, method: String) -> Result<serde_json::Value, String> {
    if text.is_empty() {
        return Err("empty_text".to_string());
    }

    if method != "paste" && method != "typing" {
        return Err("invalid_insertion_method".to_string());
    }

    Ok(serde_json::json!({
        "ok": true,
        "status": "preview",
        "method": method,
        "text": text
    }))
}

fn validate_text_insertion_input(text: &str, method: &str) -> Result<(), String> {
    if text.is_empty() {
        return Err("empty_text".to_string());
    }

    if method != "paste" && method != "typing" {
        return Err("invalid_insertion_method".to_string());
    }

    Ok(())
}

fn windows_text_insertion_script(method: &str, restore_clipboard: bool) -> Result<&'static str, String> {
    match (method, restore_clipboard) {
        ("paste", true) => Ok(
            "Add-Type -AssemblyName System.Windows.Forms; $hadText = [System.Windows.Forms.Clipboard]::ContainsText(); $previousClipboardText = if ($hadText) { [System.Windows.Forms.Clipboard]::GetText() } else { $null }; [System.Windows.Forms.Clipboard]::SetText($args[0]); Start-Sleep -Milliseconds 50; [System.Windows.Forms.SendKeys]::SendWait('^v'); Start-Sleep -Milliseconds 50; if ($hadText) { [System.Windows.Forms.Clipboard]::SetText($previousClipboardText) } else { [System.Windows.Forms.Clipboard]::Clear() }",
        ),
        ("paste", false) => Ok(
            "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText($args[0]); Start-Sleep -Milliseconds 50; [System.Windows.Forms.SendKeys]::SendWait('^v')",
        ),
        ("typing", _) => Ok(
            "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait($args[0])",
        ),
        _ => Err("invalid_insertion_method".to_string()),
    }
}

fn run_windows_text_insertion(text: &str, method: &str, restore_clipboard: bool) -> Result<(), String> {
    let script = windows_text_insertion_script(method, restore_clipboard)?;

    let status = Command::new("powershell.exe")
        .args(["-NoProfile", "-STA", "-Command", script, "--", text])
        .status()
        .map_err(|error| format!("text_insertion_unavailable:{error}"))?;

    if !status.success() {
        return Err(format!("text_insertion_failed:{status}"));
    }

    Ok(())
}

#[tauri::command]
fn honey_insert_text(
    text: String,
    method: String,
    restore_clipboard: Option<bool>,
) -> Result<serde_json::Value, String> {
    let restore_clipboard = restore_clipboard.unwrap_or(true);
    validate_text_insertion_input(&text, &method)?;
    run_windows_text_insertion(&text, &method, restore_clipboard)?;

    Ok(serde_json::json!({
        "ok": true,
        "status": "inserted",
        "method": method,
        "text": text,
        "restoreClipboard": restore_clipboard
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_invalid_window_mode() {
        assert!(honey_set_desktop_window_mode("floating".to_string()).is_err());
    }

    #[test]
    fn stores_desktop_window_mode() {
        honey_set_desktop_window_mode("mini".to_string()).expect("mini mode should be valid");

        assert_eq!(honey_get_desktop_window_mode()["mode"], "mini");
    }

    #[test]
    fn rejects_empty_hold_to_talk_hotkey() {
        assert!(honey_start_hold_to_talk_capture(" ".to_string()).is_err());
    }

    #[test]
    fn maps_global_shortcut_state_for_hold_to_talk_events() {
        assert_eq!(shortcut_state_name(ShortcutState::Pressed), "pressed");
        assert_eq!(shortcut_state_name(ShortcutState::Released), "released");
    }

    #[test]
    fn stores_hold_to_talk_capture_state() {
        let started = honey_start_hold_to_talk_capture("CapsLock".to_string())
            .expect("capture start should be valid");

        assert_eq!(started["state"], "listening");
        assert!(started["audioPath"].as_str().unwrap().ends_with(".wav"));

        let captured = honey_finish_hold_to_talk_capture()
            .expect("capture finish should be valid");

        assert_eq!(captured["state"], "captured");
        assert_eq!(captured["audioPath"], started["audioPath"]);

        let cancelled = honey_cancel_hold_to_talk_capture()
            .expect("capture cancel should be valid");

        assert_eq!(cancelled["state"], "cancelled");
        assert_eq!(cancelled.get("audioPath"), None);
    }

    #[test]
    fn previews_text_insertion_without_system_input() {
        let insertion = honey_preview_text_insertion(
            "今天下午把会议纪要发给大家。".to_string(),
            "paste".to_string(),
        )
        .expect("text insertion preview should be valid");

        assert_eq!(insertion["status"], "preview");
        assert_eq!(insertion["method"], "paste");
        assert_eq!(insertion["text"], "今天下午把会议纪要发给大家。");
    }

    #[test]
    fn rejects_invalid_text_insertion_preview() {
        assert!(honey_preview_text_insertion("".to_string(), "paste".to_string()).is_err());
        assert!(honey_preview_text_insertion("文字".to_string(), "clipboard".to_string()).is_err());
    }

    #[test]
    fn paste_text_insertion_script_can_restore_clipboard() {
        let restore_script =
            windows_text_insertion_script("paste", true).expect("paste script should be valid");
        assert!(restore_script.contains("GetText()"));
        assert!(restore_script.contains("SetText($previousClipboardText)"));

        let keep_script =
            windows_text_insertion_script("paste", false).expect("paste script should be valid");
        assert!(!keep_script.contains("GetText()"));
        assert!(!keep_script.contains("SetText($previousClipboardText)"));
    }

    #[test]
    fn desktop_capabilities_report_backend_process_management() {
        let capabilities = honey_desktop_capabilities();

        assert_eq!(capabilities["canManageBackend"], true);
        assert_eq!(capabilities["backendBaseUrl"], "http://127.0.0.1:33577");
    }

    #[test]
    fn backend_process_status_defaults_to_stopped() {
        let status = honey_get_backend_process_status();

        assert_eq!(status["ok"], true);
        assert_eq!(status["status"], "stopped");
        assert_eq!(status["baseUrl"], "http://127.0.0.1:33577");
    }

    #[test]
    fn backend_process_config_uses_environment_overrides() {
        let config = resolve_backend_process_config(
            &[
                ("HONEY_BACKEND_EXECUTABLE", "node.exe"),
                ("HONEY_BACKEND_ARGS", "backend/dist/index.js --port 33578"),
                ("HONEY_BACKEND_CWD", "D:\\products\\voice-to-text"),
                ("HONEY_BACKEND_HOST", "127.0.0.1"),
                ("HONEY_BACKEND_PORT", "33578"),
            ],
            "D:\\fallback",
        )
        .expect("backend process config should be valid");

        assert_eq!(config.executable, "node.exe");
        assert_eq!(config.args, vec!["backend/dist/index.js", "--port", "33578"]);
        assert_eq!(config.cwd, "D:\\products\\voice-to-text");
        assert_eq!(config.base_url(), "http://127.0.0.1:33578");
    }

    #[test]
    fn backend_process_config_prefers_bundled_sidecar() {
        let sidecar_path = "D:\\products\\voice-to-text\\src-tauri\\target\\release\\honey-backend.exe";
        let config = resolve_backend_process_config_with_sidecar(&[], "D:\\fallback", Some(sidecar_path))
            .expect("backend process config should prefer bundled sidecar");

        assert_eq!(config.executable, sidecar_path);
        assert_eq!(config.args, Vec::<String>::new());
        assert_eq!(config.cwd, "D:\\products\\voice-to-text\\src-tauri\\target\\release");
        assert_eq!(config.base_url(), "http://127.0.0.1:33577");
    }
}
