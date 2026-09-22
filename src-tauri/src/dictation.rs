//! Enter text with the operating system's dictation UI. Audio never passes
//! through Studio or the Jev API. These commands do not claim that a microphone
//! is listening: the OS owns recording permission, recognition and its status.

use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDictationStatus {
    pub platform: &'static str,
    /// Whether Studio can request the OS shortcut, not microphone readiness.
    pub can_start: bool,
    pub shortcut: Option<&'static str>,
    pub instructions: &'static str,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDictationStartResult {
    pub platform: &'static str,
    /// `shortcutSent` reports only keyboard delivery. `manual` starts nothing.
    pub activation: &'static str,
    pub instructions: &'static str,
}

#[tauri::command]
pub fn get_system_dictation_status() -> SystemDictationStatus {
    match std::env::consts::OS {
        // https://support.microsoft.com/en-us/accessibility/windows/use-voice-typing-to-talk-instead-of-type-on-your-pc
        "windows" => SystemDictationStatus {
            platform: "windows",
            can_start: true,
            shortcut: Some("Win + H"),
            instructions: "Windowsのオンライン音声認識で文字に変換します。マイクとインターネット接続が必要です。音声入力の画面で聞き取りが始まってから話してください。",
        },
        // The shortcut is user-configurable; do not assume Fn twice or claim
        // that an undocumented responder action started recording in WKWebView.
        // https://support.apple.com/guide/mac-help/use-dictation-mh40584/mac
        "macos" => SystemDictationStatus {
            platform: "macos",
            can_start: false,
            shortcut: Some("キーボードのマイクキー、または設定した音声入力キー"),
            instructions: "入力欄を選び、キーボードのマイクキーか音声入力のショートカットを押してください。「システム設定」→「キーボード」→「音声入力」で有効にできます。",
        },
        "linux" => SystemDictationStatus {
            platform: "linux",
            can_start: false,
            shortcut: None,
            instructions: "この環境ではアプリから音声入力を開始できません。OSの音声入力が利用できる場合は入力欄で使い、利用できない場合は文章を入力してください。",
        },
        _ => SystemDictationStatus {
            platform: "other",
            can_start: false,
            shortcut: None,
            instructions: "入力欄を選び、OSやキーボードの音声入力を使ってください。利用できない場合は文章を入力してください。",
        },
    }
}

/// No key codes, executable names or arbitrary automation parameters are
/// accepted from the webview. The caller must focus its editable field first.
#[tauri::command]
pub fn start_system_dictation(
    window: tauri::WebviewWindow,
) -> Result<SystemDictationStartResult, String> {
    if window.label() != "main" {
        return Err("音声入力はXRift Studioのメイン画面から開いてください。".to_string());
    }

    #[cfg(windows)]
    {
        windows_input::start(&window)?;
        Ok(SystemDictationStartResult {
            platform: "windows",
            activation: "shortcutSent",
            instructions: "Windowsの音声入力画面で聞き取りが始まってから話してください。終わったらWindowsのマイクを停止し、文章を確認してください。開かない場合は入力欄で Win + H を押してください。",
        })
    }

    #[cfg(not(windows))]
    {
        let status = get_system_dictation_status();
        Ok(SystemDictationStartResult {
            platform: status.platform,
            activation: "manual",
            instructions: status.instructions,
        })
    }
}

// Compile the pure ABI/sequence tests on every desktop platform, while native
// calls and user32 linking remain Windows-only.
#[cfg(any(windows, test))]
mod windows_input {
    const INPUT_KEYBOARD: u32 = 1;
    const KEYEVENTF_EXTENDEDKEY: u32 = 0x0001;
    const KEYEVENTF_KEYUP: u32 = 0x0002;
    const VK_LWIN: u16 = 0x5B;
    const VK_H: u16 = 0x48;

    // Match the *entire* Win32 INPUT union. A keyboard-only struct has the wrong
    // size (SendInput rejects it). Fixed-width LONG/DWORD and pointer-sized
    // ULONG_PTR preserve the layout on x86, x64 and Windows ARM64.
    // https://learn.microsoft.com/en-us/windows/win32/api/winuser/ns-winuser-input
    #[repr(C)]
    #[derive(Clone, Copy)]
    struct MouseInput {
        dx: i32,
        dy: i32,
        mouse_data: u32,
        flags: u32,
        time: u32,
        extra_info: usize,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct KeyboardInput {
        virtual_key: u16,
        scan_code: u16,
        flags: u32,
        time: u32,
        extra_info: usize,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct HardwareInput {
        message: u32,
        param_low: u16,
        param_high: u16,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    union InputData {
        mouse: MouseInput,
        keyboard: KeyboardInput,
        hardware: HardwareInput,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct Input {
        kind: u32,
        data: InputData,
    }

    #[cfg(target_pointer_width = "64")]
    const _: () = {
        assert!(std::mem::size_of::<Input>() == 40);
        assert!(std::mem::offset_of!(Input, data) == 8);
        assert!(std::mem::offset_of!(KeyboardInput, extra_info) == 16);
    };

    #[cfg(target_pointer_width = "32")]
    const _: () = {
        assert!(std::mem::size_of::<Input>() == 28);
        assert!(std::mem::offset_of!(Input, data) == 4);
        assert!(std::mem::offset_of!(KeyboardInput, extra_info) == 12);
    };

    impl Input {
        fn keyboard(virtual_key: u16, flags: u32) -> Self {
            // SAFETY: INPUT and its union contain only integer fields, for
            // which an all-zero value is valid. Initialize the full union.
            let mut input: Self = unsafe { std::mem::zeroed() };
            input.kind = INPUT_KEYBOARD;
            input.data.keyboard = KeyboardInput {
                virtual_key,
                scan_code: 0,
                flags,
                time: 0,
                extra_info: 0,
            };
            input
        }
    }

    fn voice_typing_inputs() -> [Input; 4] {
        [
            Input::keyboard(VK_LWIN, KEYEVENTF_EXTENDEDKEY),
            Input::keyboard(VK_H, 0),
            Input::keyboard(VK_H, KEYEVENTF_KEYUP),
            Input::keyboard(VK_LWIN, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP),
        ]
    }

    fn releases_after_partial_send(sent: u32) -> Vec<Input> {
        match sent {
            1 | 3 => vec![Input::keyboard(
                VK_LWIN,
                KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP,
            )],
            2 => voice_typing_inputs()[2..].to_vec(),
            _ => Vec::new(),
        }
    }

    #[cfg(windows)]
    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> *mut std::ffi::c_void;
        fn GetAsyncKeyState(virtual_key: i32) -> i16;
        fn SendInput(count: u32, inputs: *const Input, size: i32) -> u32;
    }

    #[cfg(windows)]
    pub(super) fn start(window: &tauri::WebviewWindow) -> Result<(), String> {
        let hwnd = window
            .hwnd()
            .map_err(|_| "音声入力を開けませんでした。入力欄で Win + H を押してください。")?
            .0 as *mut std::ffi::c_void;
        let inputs = voice_typing_inputs();

        // SendInput does not reset held keys. Refuse to interfere with the
        // user's modifiers or turn Win+H into a different system shortcut.
        // https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput
        let conflicting_keys = [0x10, 0x11, 0x12, i32::from(VK_LWIN), 0x5C, i32::from(VK_H)];
        // SAFETY: these are fixed, valid Win32 virtual-key codes.
        if conflicting_keys
            .iter()
            .any(|key| unsafe { GetAsyncKeyState(*key) } < 0)
        {
            return Err(
                "キーボードのキーを離してから、もう一度「音声入力」を押してください。".to_string(),
            );
        }

        // Check the invoking window immediately before sending the fixed
        // sequence. Do not bring another window forward or target other apps.
        // SAFETY: HWND is obtained from the invoking Tauri window; no pointer
        // is dereferenced and GetForegroundWindow is safe on any thread.
        if hwnd.is_null() || unsafe { GetForegroundWindow() } != hwnd {
            return Err(
                "XRift Studioの入力欄を選び直してから、音声入力を開いてください。".to_string(),
            );
        }

        // SAFETY: the array remains live for this call, its size matches the
        // native INPUT ABI, and every event is initialized as keyboard input.
        let sent = unsafe {
            SendInput(
                inputs.len() as u32,
                inputs.as_ptr(),
                std::mem::size_of::<Input>() as i32,
            )
        };
        if sent != inputs.len() as u32 {
            // Release only keys pressed by the accepted prefix. Releasing our
            // synthetic keys is necessary even if focus changed in the interim.
            let releases = releases_after_partial_send(sent);
            if !releases.is_empty() {
                // SAFETY: same fixed INPUT layout/lifetime as above. These
                // events only release our keys; no additional key is pressed.
                unsafe {
                    SendInput(
                        releases.len() as u32,
                        releases.as_ptr(),
                        std::mem::size_of::<Input>() as i32,
                    );
                }
            }
            return Err("音声入力を開けませんでした。WindowsキーとHキーを離し、入力欄で Win + H を押してください。".to_string());
        }
        Ok(())
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn keys(inputs: &[Input]) -> Vec<(u16, u32)> {
            inputs
                .iter()
                .map(|input| {
                    assert_eq!(input.kind, INPUT_KEYBOARD);
                    // SAFETY: the constructors used in these tests set keyboard.
                    let keyboard = unsafe { input.data.keyboard };
                    assert_eq!(keyboard.scan_code, 0);
                    assert_eq!(keyboard.time, 0);
                    assert_eq!(keyboard.extra_info, 0);
                    (keyboard.virtual_key, keyboard.flags)
                })
                .collect()
        }

        #[test]
        fn fixed_shortcut_presses_and_releases_only_windows_h() {
            assert_eq!(
                keys(&voice_typing_inputs()),
                vec![(0x5B, 1), (0x48, 0), (0x48, 2), (0x5B, 3)]
            );
        }

        #[test]
        fn partial_delivery_releases_only_keys_left_pressed() {
            assert!(releases_after_partial_send(0).is_empty());
            assert_eq!(keys(&releases_after_partial_send(1)), vec![(0x5B, 3)]);
            assert_eq!(
                keys(&releases_after_partial_send(2)),
                vec![(0x48, 2), (0x5B, 3)]
            );
            assert_eq!(keys(&releases_after_partial_send(3)), vec![(0x5B, 3)]);
            assert!(releases_after_partial_send(4).is_empty());
        }
    }
}
