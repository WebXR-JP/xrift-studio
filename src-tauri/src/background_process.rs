//! Processes owned by Studio's background work must not open a Windows console.
use std::ffi::OsStr;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub(crate) fn command(program: impl AsRef<OsStr>) -> std::process::Command {
    #[allow(unused_mut)] // Windows adds its process creation flag below.
    let mut command = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    command
}

pub(crate) fn tokio_command(program: impl AsRef<OsStr>) -> tokio::process::Command {
    command(program).into()
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn powershell() -> PathBuf {
        PathBuf::from(std::env::var_os("SystemRoot").expect("Windows SystemRoot"))
            .join("System32/WindowsPowerShell/v1.0/powershell.exe")
    }

    // Query the actual child's console, rather than just checking a flag value.
    // Pipes and exit codes must remain available for Studio's normal diagnostics.
    const PROBE: &str = r#"
Add-Type -Namespace StudioTest -Name Console -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();';
[Console]::Out.WriteLine([StudioTest.Console]::GetConsoleWindow().ToInt64());
[Console]::Error.WriteLine('studio-background-stderr');
exit 7
"#;

    fn assert_consoleless_output(output: std::process::Output) {
        assert_eq!(output.status.code(), Some(7));
        assert_eq!(String::from_utf8(output.stdout).unwrap().trim(), "0");
        assert_eq!(
            String::from_utf8(output.stderr).unwrap().trim(),
            "studio-background-stderr"
        );
    }

    #[test]
    fn synchronous_process_has_no_console_and_preserves_diagnostics() {
        assert_consoleless_output(
            command(powershell())
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    PROBE,
                ])
                .output()
                .unwrap(),
        );
    }

    #[tokio::test]
    async fn asynchronous_process_has_no_console_and_preserves_diagnostics() {
        assert_consoleless_output(
            tokio_command(powershell())
                .args([
                    "-NoLogo",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    PROBE,
                ])
                .output()
                .await
                .unwrap(),
        );
    }
}
