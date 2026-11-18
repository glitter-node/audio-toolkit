# Windows Auto-Start

Audio Toolkit v1.0.0 can start when the **current Windows 10/11 user signs in**. This optional setup uses Task Scheduler, the project's Python virtual environment, and Uvicorn. It does not need Docker, WSL2, Nginx, Apache, administrator privileges for an ordinary current-user task, or a machine-wide PowerShell execution-policy change. Read the [installation instructions](../README.md#install-and-run) first. This guide was reviewed against source; Windows sign-in behavior has **not** been tested in this documentation task.

The public [Audio Toolkit repository](https://github.com/glitter-node/audio-toolkit) and [v1.0.0 release](https://github.com/glitter-node/audio-toolkit/releases/tag/v1.0.0) provide the source and published archives. The release assets are named `audio-toolkit-v0.1.0.tar.gz` and `audio-toolkit-v0.1.0.zip` even though the release tag is `v1.0.0`; use the [TAR.GZ](https://github.com/glitter-node/audio-toolkit/releases/download/v1.0.0/audio-toolkit-v0.1.0.tar.gz) or [ZIP](https://github.com/glitter-node/audio-toolkit/releases/download/v1.0.0/audio-toolkit-v0.1.0.zip) URL as published.

## Prerequisites and initial installation

- Use a cloned repository or an extracted v1.0.0 release archive. After extraction, identify the directory containing `app\main.py`, `requirements.txt`, and `.env.example`; use that directory as the project root.
- Use the project's documented Python 3.11+ baseline. The repository does not enforce a minimum Python version in package metadata.
- Install FFmpeg and FFprobe and make both available on the `PATH` seen by the signed-in user. Install Python packages in `.venv`.
- Keep the project directory, `.venv`, and FFmpeg location stable after registering the task. The user needs write access to the configured `DATA_DIR` (default `./data`).
- Use a free localhost port. This guide uses **8012** as an example, matching `APP_PORT` in the source. Uvicorn must still receive `--port 8012` explicitly.

In a non-elevated PowerShell window, enter the actual project location and run:

```powershell
Set-Location (Read-Host "Enter the full path to the Audio Toolkit project")
Test-Path .\app\main.py
Test-Path .\requirements.txt
py --list
ffmpeg -version
ffprobe -version
py -3.11 -m venv .venv
& .\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

The two `Test-Path` commands should return `True`. Use an installed 3.11+ interpreter instead of `py -3.11` when necessary. If `.venv` already exists, **preserve it** and inspect its Python version before deciding whether to install or update packages. Do not overwrite an existing `.env` or remove `data\uploads` and `data\outputs`.

## Verify a foreground start first

Run from the project root in PowerShell:

```powershell
& .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8012
```

Open `http://127.0.0.1:8012/` and check `http://127.0.0.1:8012/api/health`. The health response reports whether FFmpeg and FFprobe are available to the application; it does not verify processing or browser editing. Stop this foreground instance with Ctrl+C **before** starting the scheduled task. No PowerShell activation script is needed.

## Optional startup script

This repository does not include a Windows startup script. The Task Scheduler action below runs the existing `.venv\Scripts\python.exe` directly. This avoids an extra script and execution-policy changes. It also means Task Scheduler's History is the default startup diagnostic; stdout/stderr are not automatically saved to a file.

## Configure a current-user logon task

These steps are **instructions only**; this documentation task does not register or run a task.

1. Open **Task Scheduler** and choose **Create Task**. Name it `Audio Toolkit - Current User`.
2. On **General**, choose the current user, **Run only when user is logged on**, and leave **Run with highest privileges** unchecked.
3. On **Triggers**, add **At log on** for this specific user. A logon task starts after that user signs in, not at machine boot before sign-in.
4. On **Actions**, choose **Start a program**. Set **Program/script** to the absolute path of the existing `...\audio-toolkit\.venv\Scripts\python.exe`. Set **Add arguments** to `-m uvicorn app.main:app --host 127.0.0.1 --port 8012`. Set **Start in** to the absolute project-root directory, without quotes. Replace both paths with the real installation location; the application reads `.env` and relative `./data` from this working directory.
5. On **Conditions**, remove any power or network condition that would unnecessarily prevent local use. Do not enable wake-from-sleep unless you intentionally want it.
6. On **Settings**, select **Do not start a new instance** when the task is already running. Enable **Run task as soon as possible after a scheduled start is missed**. If desired, set **If the task fails, restart every 1 minute**, up to **3** times. Disable any maximum run time that would stop a continuously running local server.
7. Review the saved action, trigger, user and port before enabling the task. Keep one Uvicorn worker; the job queue and status are process-local.

Task Scheduler's no-new-instance setting prevents overlap **within that task**. It cannot identify a separately launched Uvicorn process. Avoid starting the task while a manual server is running.

### PowerShell registration alternative

If you prefer commands to the Task Scheduler GUI, the following **unexecuted example** creates the same current-user task. Run it only on the intended Windows PC after reviewing the project path and port. It refuses to replace an existing task of the same name:

```powershell
$projectRoot = (Resolve-Path (Read-Host "Enter the full path to the Audio Toolkit project")).Path
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
$taskName = "Audio Toolkit - Current User"
$userId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) { throw "Virtual environment Python not found: $pythonPath" }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "app\main.py") -PathType Leaf)) { throw "Audio Toolkit entry point not found" }
if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) { throw "Task already exists: $taskName" }
$action = New-ScheduledTaskAction -Execute $pythonPath -Argument "-m uvicorn app.main:app --host 127.0.0.1 --port 8012" -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $userId
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $userId -LogonType InteractiveToken -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description "Starts local Audio Toolkit at user logon."
```

If using a different port, change `8012` in the action and in the verification URLs. The command does not open a firewall port, start the task immediately, stop an existing listener or modify `.env` and runtime audio.

## Existing process and port conflicts

Before manual or scheduled startup, inspect the example port:

```powershell
Get-NetTCPConnection -LocalPort 8012 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress, OwningProcess
```

If a listener exists, identify its owner before taking any action:

```powershell
Get-CimInstance Win32_Process -Filter "ProcessId = 1234" | Select-Object ProcessId, ExecutablePath, CommandLine
```

Replace `1234` with the reported process ID. A port conflict makes Uvicorn startup fail; the documented action never terminates another process or silently picks a new port. If the owner is an intended existing Audio Toolkit instance, use it or stop it deliberately. If another application owns the port, choose another free port in both the manual and scheduled commands and open that matching local URL. Do not kill an unidentified process.

## Logging, restart, and failure handling

Enable **All Tasks History** in Task Scheduler, then inspect the task's **History** and **Last Run Result** after sign-in. Windows Event Viewer also exposes `Microsoft-Windows-TaskScheduler/Operational`. The direct Python action does **not** create Uvicorn log files or rotate logs; for an unexplained failure, run the exact saved Uvicorn command in a foreground PowerShell window to see its startup output. Review paths, Python packages, FFmpeg availability, `.env`, working directory and port ownership. A restart policy should be limited to a small number of attempts so a persistent failure does not loop indefinitely.

Stopping the scheduled task may terminate its action, but the guide has not verified Windows child-process behavior. Identify the relevant Python process and confirm the port is free before starting another instance. Do not assume that disabling a task stops an already-running server.

## Verify after Windows sign-in

After signing in, inspect the task and the local application:

```powershell
Get-ScheduledTask -TaskName "Audio Toolkit - Current User" | Select-Object TaskName, State
Get-ScheduledTaskInfo -TaskName "Audio Toolkit - Current User" | Select-Object LastRunTime, LastTaskResult
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8012/api/health
```

Open `http://127.0.0.1:8012/` in the browser. Manually upload a small nonprivate test file, inspect the waveform, run one short conversion, and confirm preview/download if you need functional confidence. Check the saved port instead of 8012 if you changed it. These checks have **not** been executed for this guide.

## Stop, disable, re-enable, or remove

Use only the command that matches the intended action:

```powershell
Stop-ScheduledTask -TaskName "Audio Toolkit - Current User"
Disable-ScheduledTask -TaskName "Audio Toolkit - Current User"
Enable-ScheduledTask -TaskName "Audio Toolkit - Current User"
Unregister-ScheduledTask -TaskName "Audio Toolkit - Current User" -Confirm:$true
```

Confirm the server process and port after stopping. Disabling or unregistering a task does **not** delete `.env`, uploads, outputs, downloads, or the virtual environment. Preserve all runtime data during troubleshooting.

## Security and data preservation

The example binds Uvicorn to `127.0.0.1` and does not open a firewall port. It is for use on the same PC. The API has no user login or per-user file isolation; LAN or public exposure needs a separate authentication, transport, request-limit and privacy review. Keep `.env` and `DATA_DIR` accessible only to intended local users. Uploads and outputs are temporarily stored under `DATA_DIR`; normal cleanup uses the configured retention policy. Read [Operations and security](../README.md#operations-and-security) before exposing the app remotely.

## Troubleshooting and limitations

- **Task starts but the site is unavailable:** Check **Start in**, the saved bind port, task History, and an existing listener. Run the same Python command manually to read startup errors.
- **FFmpeg missing in the task:** Confirm `ffmpeg -version` and `ffprobe -version` in the signed-in user's environment; if `PATH` was changed, sign in again before checking the task.
- **Task requires elevation or is blocked:** Verify it is a current-user logon task and review local organization policy. Do not change a machine-wide PowerShell execution policy as a workaround.
- **Results appear expired or job status disappears:** The backend keeps job status in memory and applies file retention under `DATA_DIR`; restarts lose status. Preserve existing files and inspect the configured retention period.
- **No Uvicorn log file:** Direct executable startup provides Task Scheduler diagnostics, not persisted stdout/stderr. Capturing detailed application logs requires a separately reviewed wrapper or logging arrangement.

Windows Task Scheduler behavior, logon timing, FFmpeg codec availability, task stop semantics and browser workflows remain **manually unverified**. This guide does not install packages, start a server, register a task or inspect user audio.
