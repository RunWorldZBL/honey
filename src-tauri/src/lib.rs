use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::{env, net::TcpStream};

#[cfg(not(test))]
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
#[cfg(not(test))]
use std::sync::mpsc;
#[cfg(not(test))]
use std::thread::{self, JoinHandle};
#[cfg(not(test))]
use std::time::Instant;
#[cfg(not(test))]
use tauri::menu::MenuBuilder;
#[cfg(not(test))]
use tauri::tray::TrayIconBuilder;
use tauri::Emitter;
#[cfg(not(test))]
use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
static DESKTOP_WINDOW_MODE: OnceLock<Mutex<String>> = OnceLock::new();
static HOLD_TO_TALK_CAPTURE: OnceLock<Mutex<HoldToTalkCapture>> = OnceLock::new();
static REGISTERED_HOLD_TO_TALK_HOTKEY: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static BACKEND_PROCESS: OnceLock<Mutex<BackendProcessState>> = OnceLock::new();
static TRAY_ENABLED: OnceLock<Mutex<bool>> = OnceLock::new();

const HOLD_TO_TALK_HOTKEY_EVENT: &str = "honey://hold-to-talk-hotkey";
#[cfg(not(test))]
const DESKTOP_WINDOW_MODE_EVENT: &str = "honey://desktop-window-mode";
#[cfg(not(test))]
const HOLD_TO_TALK_VOLUME_EVENT: &str = "honey://hold-to-talk-volume";
const DEFAULT_BACKEND_HOST: &str = "127.0.0.1";
const DEFAULT_BACKEND_PORT: u16 = 33577;
const HOLD_TO_TALK_SAMPLE_RATE: u32 = 16_000;
#[cfg(not(test))]
const HOLD_TO_TALK_VOLUME_INTERVAL_MS: u64 = 48;
#[cfg(not(test))]
const TRAY_OPEN_MAIN_ID: &str = "tray-open-main";
#[cfg(not(test))]
const TRAY_OPEN_MINI_ID: &str = "tray-open-mini";
#[cfg(not(test))]
const TRAY_QUIT_ID: &str = "tray-quit";

struct HoldToTalkCapture {
    state: String,
    hotkey: String,
    audio_path: Option<String>,
    recorder: Option<NativeAudioRecorder>,
}

struct NativeAudioRecorder {
    path: PathBuf,
    samples: Arc<Mutex<Vec<f32>>>,
    source_sample_rate: u32,
    channels: usize,
    #[cfg(not(test))]
    stop_sender: mpsc::Sender<()>,
    #[cfg(not(test))]
    thread: JoinHandle<Result<(), String>>,
}

#[cfg(not(test))]
struct NativeVolumeReporter {
    app: tauri::AppHandle,
    last_emit: Instant,
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
            recorder: None,
        })
    })
}

fn registered_hold_to_talk_hotkey() -> &'static Mutex<Option<String>> {
    REGISTERED_HOLD_TO_TALK_HOTKEY.get_or_init(|| Mutex::new(None))
}

fn backend_process_state() -> &'static Mutex<BackendProcessState> {
    BACKEND_PROCESS.get_or_init(|| Mutex::new(BackendProcessState::default()))
}

fn tray_enabled() -> &'static Mutex<bool> {
    TRAY_ENABLED.get_or_init(|| Mutex::new(true))
}

fn should_hide_window_on_close(window_label: &str, tray_enabled: bool) -> bool {
    window_label == "main" && tray_enabled
}

fn set_desktop_window_mode_state(mode: &str) -> Result<String, String> {
    if mode != "full" && mode != "mini" {
        return Err("invalid_window_mode".to_string());
    }

    *desktop_window_mode()
        .lock()
        .expect("desktop window mode lock poisoned") = mode.to_string();

    Ok(mode.to_string())
}

fn desktop_window_mode_json(mode: &str) -> serde_json::Value {
    serde_json::json!({
        "ok": true,
        "mode": mode
    })
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
        vec![
            "--filter".to_string(),
            "backend".to_string(),
            "dev".to_string(),
        ]
    };
    let cwd = env_pair_value(env_pairs, "HONEY_BACKEND_CWD").unwrap_or_else(|| {
        sidecar_executable
            .map(|path| sidecar_working_directory(path, fallback_cwd))
            .unwrap_or_else(|| fallback_cwd.to_string())
    });
    let host = env_pair_value(env_pairs, "HONEY_BACKEND_HOST")
        .unwrap_or_else(|| DEFAULT_BACKEND_HOST.to_string());
    let port = env_pair_value(env_pairs, "HONEY_BACKEND_PORT")
        .map(|value| {
            value
                .parse::<u16>()
                .map_err(|_| "invalid_backend_port".to_string())
        })
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

fn create_hold_to_talk_audio_path() -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| "capture_clock_error".to_string())?
        .as_millis();
    let mut path = std::env::temp_dir();
    path.push("honey");
    path.push("captures");
    std::fs::create_dir_all(&path).map_err(|error| format!("capture_dir_unavailable:{error}"))?;
    path.push(format!("hold-to-talk-{timestamp}.wav"));

    Ok(path)
}

#[cfg(test)]
fn start_native_audio_recorder(path: PathBuf) -> Result<NativeAudioRecorder, String> {
    let samples = (0..640)
        .map(|index| if index % 2 == 0 { 0.35 } else { -0.35 })
        .collect::<Vec<f32>>();

    Ok(NativeAudioRecorder {
        path,
        samples: Arc::new(Mutex::new(samples)),
        source_sample_rate: HOLD_TO_TALK_SAMPLE_RATE,
        channels: 1,
    })
}

#[cfg(not(test))]
fn start_native_audio_recorder(path: PathBuf) -> Result<NativeAudioRecorder, String> {
    let (stop_sender, stop_receiver) = mpsc::channel::<()>();
    let (ready_sender, ready_receiver) = mpsc::channel::<Result<(u32, usize), String>>();
    let samples = Arc::new(Mutex::new(Vec::<f32>::new()));
    let thread_samples = Arc::clone(&samples);

    let thread = thread::spawn(move || {
        run_native_audio_capture(stop_receiver, ready_sender, thread_samples)
    });

    let (source_sample_rate, channels) = ready_receiver
        .recv()
        .map_err(|error| format!("capture_stream_start_failed:{error}"))??;

    Ok(NativeAudioRecorder {
        path,
        samples,
        source_sample_rate,
        channels,
        stop_sender,
        thread,
    })
}

#[cfg(not(test))]
fn run_native_audio_capture(
    stop_receiver: mpsc::Receiver<()>,
    ready_sender: mpsc::Sender<Result<(u32, usize), String>>,
    samples: Arc<Mutex<Vec<f32>>>,
) -> Result<(), String> {
    let host = cpal::default_host();
    let device = match host.default_input_device() {
        Some(device) => device,
        None => {
            let message = "capture_input_device_unavailable".to_string();
            let _ = ready_sender.send(Err(message.clone()));
            return Err(message);
        }
    };
    let supported_config = match device.default_input_config() {
        Ok(config) => config,
        Err(error) => {
            let message = format!("capture_input_config_unavailable:{error}");
            let _ = ready_sender.send(Err(message.clone()));
            return Err(message);
        }
    };
    let sample_format = supported_config.sample_format();
    let stream_config = supported_config.config();
    let channels = usize::from(stream_config.channels);
    let source_sample_rate = stream_config.sample_rate.0;

    let stream = match sample_format {
        cpal::SampleFormat::F32 => {
            let callback_samples = Arc::clone(&samples);
            let mut volume_reporter = create_native_volume_reporter();
            device.build_input_stream(
                &stream_config,
                move |data: &[f32], _| {
                    let (sum_squares, sample_count) = append_f32_samples(data, &callback_samples);
                    emit_native_volume_level(&mut volume_reporter, sum_squares, sample_count);
                },
                native_audio_error_callback,
                None,
            )
        }
        cpal::SampleFormat::I16 => {
            let callback_samples = Arc::clone(&samples);
            let mut volume_reporter = create_native_volume_reporter();
            device.build_input_stream(
                &stream_config,
                move |data: &[i16], _| {
                    let (sum_squares, sample_count) = append_i16_samples(data, &callback_samples);
                    emit_native_volume_level(&mut volume_reporter, sum_squares, sample_count);
                },
                native_audio_error_callback,
                None,
            )
        }
        cpal::SampleFormat::U16 => {
            let callback_samples = Arc::clone(&samples);
            let mut volume_reporter = create_native_volume_reporter();
            device.build_input_stream(
                &stream_config,
                move |data: &[u16], _| {
                    let (sum_squares, sample_count) = append_u16_samples(data, &callback_samples);
                    emit_native_volume_level(&mut volume_reporter, sum_squares, sample_count);
                },
                native_audio_error_callback,
                None,
            )
        }
        unsupported => {
            let message = format!("capture_input_sample_format_unsupported:{unsupported:?}");
            let _ = ready_sender.send(Err(message.clone()));
            return Err(message);
        }
    };
    let stream = match stream {
        Ok(stream) => stream,
        Err(error) => {
            let message = format!("capture_stream_unavailable:{error}");
            let _ = ready_sender.send(Err(message.clone()));
            return Err(message);
        }
    };

    if let Err(error) = stream.play() {
        let message = format!("capture_stream_start_failed:{error}");
        let _ = ready_sender.send(Err(message.clone()));
        return Err(message);
    }

    let _ = ready_sender.send(Ok((source_sample_rate, channels)));
    let _ = stop_receiver.recv();

    Ok(())
}

#[cfg(not(test))]
fn native_audio_error_callback(error: cpal::StreamError) {
    eprintln!("honey native audio capture error: {error}");
}

fn rms_volume_level_from_sum(sum_squares: f32, sample_count: usize) -> f32 {
    if sample_count == 0 || sum_squares <= 0.0 {
        return 0.0;
    }

    (sum_squares / sample_count as f32).sqrt().clamp(0.0, 1.0)
}

#[cfg(not(test))]
fn create_native_volume_reporter() -> Option<NativeVolumeReporter> {
    let now = Instant::now();
    APP_HANDLE.get().cloned().map(|app| NativeVolumeReporter {
        app,
        last_emit: now
            .checked_sub(Duration::from_millis(HOLD_TO_TALK_VOLUME_INTERVAL_MS))
            .unwrap_or(now),
    })
}

#[cfg(not(test))]
fn emit_native_volume_level(
    reporter: &mut Option<NativeVolumeReporter>,
    sum_squares: f32,
    sample_count: usize,
) {
    let Some(reporter) = reporter.as_mut() else {
        return;
    };
    let now = Instant::now();
    if now.duration_since(reporter.last_emit)
        < Duration::from_millis(HOLD_TO_TALK_VOLUME_INTERVAL_MS)
    {
        return;
    }

    reporter.last_emit = now;
    let volume_level = rms_volume_level_from_sum(sum_squares, sample_count);
    let _ = reporter.app.emit(
        HOLD_TO_TALK_VOLUME_EVENT,
        serde_json::json!({ "volumeLevel": volume_level }),
    );
}

#[cfg(not(test))]
fn append_f32_samples(input: &[f32], samples: &Arc<Mutex<Vec<f32>>>) -> (f32, usize) {
    let mut sum_squares = 0.0;
    let mut sample_count = 0;
    if let Ok(mut output) = samples.lock() {
        for sample in input {
            let normalized = sample.clamp(-1.0, 1.0);
            sum_squares += normalized * normalized;
            sample_count += 1;
            output.push(normalized);
        }
    } else {
        for sample in input {
            let normalized = sample.clamp(-1.0, 1.0);
            sum_squares += normalized * normalized;
            sample_count += 1;
        }
    }

    (sum_squares, sample_count)
}

#[cfg(not(test))]
fn append_i16_samples(input: &[i16], samples: &Arc<Mutex<Vec<f32>>>) -> (f32, usize) {
    let mut sum_squares = 0.0;
    let mut sample_count = 0;
    if let Ok(mut output) = samples.lock() {
        for sample in input {
            let normalized = (f32::from(*sample) / f32::from(i16::MAX)).clamp(-1.0, 1.0);
            sum_squares += normalized * normalized;
            sample_count += 1;
            output.push(normalized);
        }
    } else {
        for sample in input {
            let normalized = (f32::from(*sample) / f32::from(i16::MAX)).clamp(-1.0, 1.0);
            sum_squares += normalized * normalized;
            sample_count += 1;
        }
    }

    (sum_squares, sample_count)
}

#[cfg(not(test))]
fn append_u16_samples(input: &[u16], samples: &Arc<Mutex<Vec<f32>>>) -> (f32, usize) {
    let mut sum_squares = 0.0;
    let mut sample_count = 0;
    if let Ok(mut output) = samples.lock() {
        for sample in input {
            let normalized = ((f32::from(*sample) - 32768.0) / 32768.0).clamp(-1.0, 1.0);
            sum_squares += normalized * normalized;
            sample_count += 1;
            output.push(normalized);
        }
    } else {
        for sample in input {
            let normalized = ((f32::from(*sample) - 32768.0) / 32768.0).clamp(-1.0, 1.0);
            sum_squares += normalized * normalized;
            sample_count += 1;
        }
    }

    (sum_squares, sample_count)
}

fn finish_native_audio_recorder(recorder: NativeAudioRecorder) -> Result<(), String> {
    let NativeAudioRecorder {
        path,
        samples,
        source_sample_rate,
        channels,
        #[cfg(not(test))]
        stop_sender,
        #[cfg(not(test))]
        thread,
    } = recorder;
    #[cfg(not(test))]
    {
        let _ = stop_sender.send(());
        thread
            .join()
            .map_err(|_| "capture_thread_join_failed".to_string())??;
    }

    let samples = samples
        .lock()
        .map_err(|_| "capture_samples_unavailable".to_string())?
        .clone();
    let pcm_samples = convert_to_mono_pcm16(
        &samples,
        source_sample_rate,
        channels,
        HOLD_TO_TALK_SAMPLE_RATE,
    )?;

    write_pcm16_wav_file(&path, &pcm_samples, HOLD_TO_TALK_SAMPLE_RATE)
}

fn discard_native_audio_recorder(recorder: NativeAudioRecorder) {
    #[cfg(not(test))]
    {
        let NativeAudioRecorder {
            stop_sender,
            thread,
            ..
        } = recorder;
        let _ = stop_sender.send(());
        let _ = thread.join();
    }

    #[cfg(test)]
    {
        let _ = recorder;
    }
}

fn convert_to_mono_pcm16(
    samples: &[f32],
    source_sample_rate: u32,
    channels: usize,
    target_sample_rate: u32,
) -> Result<Vec<i16>, String> {
    if source_sample_rate == 0 || target_sample_rate == 0 || channels == 0 {
        return Err("capture_audio_format_invalid".to_string());
    }

    let source_frame_count = samples.len() / channels;
    if source_frame_count == 0 {
        return Err("capture_audio_empty".to_string());
    }

    let target_frame_count = ((source_frame_count as u64 * u64::from(target_sample_rate))
        / u64::from(source_sample_rate))
    .max(1) as usize;
    let mut pcm_samples = Vec::with_capacity(target_frame_count);
    for target_frame in 0..target_frame_count {
        let source_frame = ((target_frame as u64 * u64::from(source_sample_rate))
            / u64::from(target_sample_rate))
        .min(source_frame_count.saturating_sub(1) as u64) as usize;
        let frame_offset = source_frame * channels;
        let mono_sample = samples[frame_offset..frame_offset + channels]
            .iter()
            .copied()
            .sum::<f32>()
            / channels as f32;
        pcm_samples.push(float_sample_to_i16(mono_sample));
    }

    Ok(pcm_samples)
}

fn float_sample_to_i16(sample: f32) -> i16 {
    let clamped = sample.clamp(-1.0, 1.0);
    if clamped >= 0.0 {
        (clamped * f32::from(i16::MAX)).round() as i16
    } else {
        (clamped * 32768.0).round() as i16
    }
}

fn write_pcm16_wav_file(path: &Path, samples: &[i16], sample_rate: u32) -> Result<(), String> {
    let channels = 1u16;
    let bits_per_sample = 16u16;
    let data_size: u32 = (samples.len() * std::mem::size_of::<i16>())
        .try_into()
        .map_err(|_| "capture_audio_too_large".to_string())?;
    let byte_rate = sample_rate * u32::from(channels) * u32::from(bits_per_sample) / 8;
    let block_align = channels * bits_per_sample / 8;
    let mut wav_bytes = Vec::with_capacity(44 + data_size as usize);

    wav_bytes.extend_from_slice(b"RIFF");
    wav_bytes.extend_from_slice(&(36u32 + data_size).to_le_bytes());
    wav_bytes.extend_from_slice(b"WAVE");
    wav_bytes.extend_from_slice(b"fmt ");
    wav_bytes.extend_from_slice(&16u32.to_le_bytes());
    wav_bytes.extend_from_slice(&1u16.to_le_bytes());
    wav_bytes.extend_from_slice(&channels.to_le_bytes());
    wav_bytes.extend_from_slice(&sample_rate.to_le_bytes());
    wav_bytes.extend_from_slice(&byte_rate.to_le_bytes());
    wav_bytes.extend_from_slice(&block_align.to_le_bytes());
    wav_bytes.extend_from_slice(&bits_per_sample.to_le_bytes());
    wav_bytes.extend_from_slice(b"data");
    wav_bytes.extend_from_slice(&data_size.to_le_bytes());
    for sample in samples {
        wav_bytes.extend_from_slice(&sample.to_le_bytes());
    }

    std::fs::write(path, wav_bytes).map_err(|error| format!("capture_file_unavailable:{error}"))
}

#[cfg(not(test))]
fn show_main_window(app: &tauri::AppHandle, mode: &str) {
    let Ok(mode) = set_desktop_window_mode_state(mode) else {
        return;
    };

    let _ = app.emit(
        DESKTOP_WINDOW_MODE_EVENT,
        serde_json::json!({ "mode": mode }),
    );

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(not(test))]
fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let menu = MenuBuilder::new(app)
        .text(TRAY_OPEN_MAIN_ID, "打开 honey")
        .text(TRAY_OPEN_MINI_ID, "迷你窗口")
        .separator()
        .text(TRAY_QUIT_ID, "退出")
        .build()?;
    let mut tray = TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("honey - 甜美")
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_OPEN_MAIN_ID => show_main_window(app, "full"),
            TRAY_OPEN_MINI_ID => show_main_window(app, "mini"),
            TRAY_QUIT_ID => app.exit(0),
            _ => {}
        });

    if let Some(icon) = app.default_window_icon().cloned() {
        tray = tray.icon(icon);
    }

    tray.build(app)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let tray_enabled = *tray_enabled().lock().expect("tray enabled lock poisoned");
                if should_hide_window_on_close(window.label(), tray_enabled) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .setup(|app| {
            let _ = APP_HANDLE.set(app.handle().clone());
            #[cfg(not(test))]
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            honey_desktop_capabilities,
            honey_get_backend_process_status,
            honey_start_backend_process,
            honey_stop_backend_process,
            honey_get_desktop_window_mode,
            honey_set_desktop_window_mode,
            honey_set_tray_enabled,
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
        "canUseTray": true,
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
        return backend_process_status_json("running", &config, false, None, state.detail.clone());
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
        return backend_process_status_json("running", &config, false, None, state.detail.clone());
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
    let mode = set_desktop_window_mode_state(&mode)?;
    Ok(desktop_window_mode_json(&mode))
}

#[tauri::command]
fn honey_set_tray_enabled(enabled: bool) -> Result<serde_json::Value, String> {
    *tray_enabled().lock().expect("tray enabled lock poisoned") = enabled;

    Ok(serde_json::json!({
        "ok": true,
        "enabled": enabled
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
fn honey_unregister_hold_to_talk_hotkey(
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
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
    let normalized_hotkey = hotkey.trim().to_string();
    if normalized_hotkey.is_empty() {
        return Err("invalid_hotkey".to_string());
    }

    let previous_recorder = {
        let mut capture = hold_to_talk_capture()
            .lock()
            .expect("hold-to-talk capture lock poisoned");
        capture.state = "cancelled".to_string();
        capture.audio_path = None;
        capture.recorder.take()
    };
    if let Some(recorder) = previous_recorder {
        discard_native_audio_recorder(recorder);
    }

    let audio_path = create_hold_to_talk_audio_path()?;
    let audio_path_text = audio_path.to_string_lossy().into_owned();
    let recorder = start_native_audio_recorder(audio_path)?;

    let mut capture = hold_to_talk_capture()
        .lock()
        .expect("hold-to-talk capture lock poisoned");
    capture.state = "listening".to_string();
    capture.hotkey = normalized_hotkey;
    capture.audio_path = Some(audio_path_text);
    capture.recorder = Some(recorder);

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

    let recorder = capture
        .recorder
        .take()
        .ok_or_else(|| "capture_recorder_unavailable".to_string())?;
    finish_native_audio_recorder(recorder)?;
    capture.state = "captured".to_string();

    Ok(hold_to_talk_capture_json(&capture))
}

#[tauri::command]
fn honey_cancel_hold_to_talk_capture() -> Result<serde_json::Value, String> {
    let mut capture = hold_to_talk_capture()
        .lock()
        .expect("hold-to-talk capture lock poisoned");
    if let Some(recorder) = capture.recorder.take() {
        discard_native_audio_recorder(recorder);
    }

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

fn windows_text_insertion_script(
    method: &str,
    restore_clipboard: bool,
) -> Result<&'static str, String> {
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

fn run_windows_text_insertion(
    text: &str,
    method: &str,
    restore_clipboard: bool,
) -> Result<(), String> {
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
    fn calculates_hold_to_talk_volume_level() {
        assert_eq!(rms_volume_level_from_sum(0.0, 0), 0.0);
        assert_eq!(rms_volume_level_from_sum(0.0, 3), 0.0);
        assert!((rms_volume_level_from_sum(0.25, 1) - 0.5).abs() < f32::EPSILON);
        assert_eq!(rms_volume_level_from_sum(9.0, 1), 1.0);
    }

    #[test]
    fn stores_hold_to_talk_capture_state() {
        let started = honey_start_hold_to_talk_capture("CapsLock".to_string())
            .expect("capture start should be valid");

        assert_eq!(started["state"], "listening");
        let audio_path = started["audioPath"].as_str().unwrap();
        assert!(audio_path.ends_with(".wav"));

        let captured = honey_finish_hold_to_talk_capture().expect("capture finish should be valid");

        assert_eq!(captured["state"], "captured");
        assert_eq!(captured["audioPath"], started["audioPath"]);
        let wav_bytes = std::fs::read(audio_path).expect("captured audio file should be readable");
        assert_eq!(&wav_bytes[0..4], b"RIFF");
        assert_eq!(&wav_bytes[8..12], b"WAVE");
        assert_eq!(u16::from_le_bytes([wav_bytes[20], wav_bytes[21]]), 1);
        assert_eq!(u16::from_le_bytes([wav_bytes[22], wav_bytes[23]]), 1);
        assert_eq!(
            u32::from_le_bytes([wav_bytes[24], wav_bytes[25], wav_bytes[26], wav_bytes[27]]),
            16_000,
        );
        assert_eq!(u16::from_le_bytes([wav_bytes[34], wav_bytes[35]]), 16);
        assert!(
            u32::from_le_bytes([wav_bytes[40], wav_bytes[41], wav_bytes[42], wav_bytes[43]]) > 0,
            "captured WAV should contain PCM samples",
        );

        let cancelled =
            honey_cancel_hold_to_talk_capture().expect("capture cancel should be valid");

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
        assert_eq!(capabilities["canUseTray"], true);
        assert_eq!(capabilities["backendBaseUrl"], "http://127.0.0.1:33577");
    }

    #[test]
    fn stores_tray_enabled_preference() {
        let disabled = honey_set_tray_enabled(false).expect("tray preference should be valid");
        assert_eq!(disabled["ok"], true);
        assert_eq!(disabled["enabled"], false);

        let enabled = honey_set_tray_enabled(true).expect("tray preference should be valid");
        assert_eq!(enabled["ok"], true);
        assert_eq!(enabled["enabled"], true);
    }

    #[test]
    fn only_hides_main_window_on_close_when_tray_is_enabled() {
        assert_eq!(should_hide_window_on_close("main", true), true);
        assert_eq!(should_hide_window_on_close("main", false), false);
        assert_eq!(should_hide_window_on_close("settings", true), false);
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
        assert_eq!(
            config.args,
            vec!["backend/dist/index.js", "--port", "33578"]
        );
        assert_eq!(config.cwd, "D:\\products\\voice-to-text");
        assert_eq!(config.base_url(), "http://127.0.0.1:33578");
    }

    #[test]
    fn backend_process_config_prefers_bundled_sidecar() {
        let sidecar_path =
            "D:\\products\\voice-to-text\\src-tauri\\target\\release\\honey-backend.exe";
        let config =
            resolve_backend_process_config_with_sidecar(&[], "D:\\fallback", Some(sidecar_path))
                .expect("backend process config should prefer bundled sidecar");

        assert_eq!(config.executable, sidecar_path);
        assert_eq!(config.args, Vec::<String>::new());
        assert_eq!(
            config.cwd,
            "D:\\products\\voice-to-text\\src-tauri\\target\\release"
        );
        assert_eq!(config.base_url(), "http://127.0.0.1:33577");
    }
}
