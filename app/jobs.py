import json
import math
import os
import signal
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from concurrent.futures import Future
from pathlib import Path

from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator

from app.config import settings
from app.routes import media_path, get_duration, require_tool

FORMATS = "^(mp3|wav|flac|ogg|opus|m4a)$"
TERMINAL = {"completed", "failed", "cancelled"}
_lock = threading.RLock()
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="audio-job")
_jobs = {}
_futures: dict[str, Future] = {}


class JobRequest(BaseModel):
    operation: str = Field(pattern="^(convert|trim|remove|effects|merge)$")
    file_id: str | None = None
    file_ids: list[str] | None = None
    output_format: str = Field(default="mp3", pattern=FORMATS)
    start: float = Field(default=0, ge=0, allow_inf_nan=False)
    end: float = Field(default=0, ge=0, allow_inf_nan=False)
    volume_db: float = Field(default=0, ge=-40, le=20, allow_inf_nan=False)
    fade_in: float = Field(default=0, ge=0, le=3600, allow_inf_nan=False)
    fade_out: float = Field(default=0, ge=0, le=3600, allow_inf_nan=False)
    crossfade_ms: float = Field(default=20, ge=0, le=100, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_operation(self):
        if self.operation == "merge":
            if not self.file_ids or not 2 <= len(self.file_ids) <= 10 or len(set(self.file_ids)) != len(self.file_ids):
                raise ValueError("Provide 2 to 10 unique audio files")
        elif not self.file_id:
            raise ValueError("Audio file is required")
        if self.operation in {"trim", "remove"} and self.end <= self.start:
            raise ValueError("Invalid trim range")
        return self


def prepare(request):
    if request.operation == "merge":
        sources = [media_path(item) for item in request.file_ids]
        durations = [get_duration(source) for source in sources]
        total = sum(durations)
    else:
        sources = [media_path(request.file_id)]
        total = get_duration(sources[0])
    if request.operation in {"trim", "remove"} and request.end > total + 0.05:
        raise HTTPException(422, "Trim range exceeds audio duration")
    if request.operation == "effects" and request.fade_in + request.fade_out > total:
        raise HTTPException(422, "Combined fades exceed audio duration")
    if request.operation == "remove" and request.end - request.start >= total - 0.02:
        raise HTTPException(422, "Removal must leave some audio")
    target_duration = request.end - request.start if request.operation == "trim" else total - (request.end - request.start) if request.operation == "remove" else total
    return sources, target_duration, total


def command_for(request, sources, duration, total, target):
    cmd = [require_tool("ffmpeg"), "-nostdin", "-hide_banner", "-loglevel", "error", "-y"]
    if request.operation == "trim":
        cmd += ["-ss", str(request.start)]
    for source in sources:
        cmd += ["-i", str(source)]
    if request.operation == "remove":
        overlap = min(request.crossfade_ms / 1000, request.start * 2, (total - request.end) * 2, request.end - request.start)
        if overlap >= 0.001:
            half = overlap / 2
            graph = (f"[0:a:0]atrim=start=0:end={request.start + half:.6f},asetpts=PTS-STARTPTS[first];"
                     f"[0:a:0]atrim=start={request.end - half:.6f},asetpts=PTS-STARTPTS[last];"
                     f"[first][last]acrossfade=d={overlap:.6f}:c1=tri:c2=tri[out]")
        else:
            graph = (f"[0:a:0]atrim=start=0:end={request.start:.6f},asetpts=PTS-STARTPTS[first];"
                     f"[0:a:0]atrim=start={request.end:.6f},asetpts=PTS-STARTPTS[last];"
                     "[first][last]concat=n=2:v=0:a=1[out]")
        cmd += ["-filter_complex", graph, "-map", "[out]"]
    elif request.operation == "merge":
        inputs = "".join(f"[{index}:a:0]" for index in range(len(sources)))
        cmd += ["-filter_complex", f"{inputs}concat=n={len(sources)}:v=0:a=1[out]", "-map", "[out]"]
    else:
        cmd += ["-map", "0:a:0"]
    if request.operation == "trim":
        cmd += ["-t", str(duration)]
    if request.operation == "effects":
        filters = [f"volume={request.volume_db:.3f}dB"]
        if request.fade_in:
            filters.append(f"afade=t=in:st=0:d={request.fade_in:.3f}")
        if request.fade_out:
            filters.append(f"afade=t=out:st={total - request.fade_out:.3f}:d={request.fade_out:.3f}")
        cmd += ["-af", ",".join(filters)]
    cmd += ["-vn", "-progress", "pipe:1", "-nostats", str(target)]
    return cmd


def snapshot(job):
    return {key: job[key] for key in ("job_id", "status", "progress", "message", "download_url", "preview_url", "created_at")}


def get_job(job_id):
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Job not found")
        return snapshot(job)


def submit_job(request):
    sources, duration, total = prepare(request)
    require_tool("ffmpeg")
    with _lock:
        active = sum(job["status"] not in TERMINAL for job in _jobs.values())
        if active >= settings.max_pending_jobs:
            raise HTTPException(429, "Audio job queue is full")
        job_id = str(uuid.uuid4())
        job = {"job_id": job_id, "status": "queued", "progress": 0, "message": "Queued", "download_url": None, "preview_url": None, "created_at": time.time(), "cancel": threading.Event(), "process": None, "sources": sources, "target": None}
        _jobs[job_id] = job
    future = _executor.submit(run_job, job_id, request, sources, duration, total)
    with _lock:
        _futures[job_id] = future
    return snapshot(job)


def run_job(job_id, request, sources, duration, total):
    with _lock:
        job = _jobs[job_id]
        if job["cancel"].is_set():
            job.update(status="cancelled", message="Cancelled")
            return
        job.update(status="running", message="Processing audio")
    output_dir = settings.data_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_id = str(uuid.uuid4())
    target = output_dir / f"{output_id}.{request.output_format}"
    process = None
    error_log = tempfile.TemporaryFile(mode="w+t")
    with _lock:
        job["target"] = target
    try:
        command = command_for(request, sources, duration, total, target)
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=error_log, text=True, bufsize=1, start_new_session=(os.name == "posix"))
        with _lock:
            job["process"] = process
            cancelled = job["cancel"].is_set()
        if cancelled:
            stop_process(process)
        timed_out = threading.Event()
        finished = threading.Event()
        def timeout_job():
            if not finished.is_set() and process.poll() is None:
                timed_out.set()
                stop_process(process)
        timer = threading.Timer(settings.job_timeout_seconds, timeout_job)
        timer.daemon = True
        timer.start()
        for line in process.stdout:
            if job["cancel"].is_set():
                stop_process(process)
            key, _, value = line.strip().partition("=")
            if key in {"out_time_us", "out_time_ms"}:
                try:
                    fraction = float(value) / 1000000 / duration
                    if math.isfinite(fraction):
                        with _lock:
                            job["progress"] = max(job["progress"], min(99, round(fraction * 100)))
                except ValueError:
                    pass
        return_code = process.wait(timeout=10)
        finished.set()
        timer.cancel()
        with _lock:
            cancelled = job["cancel"].is_set()
        if cancelled:
            with _lock:
                job.update(status="cancelled", message="Cancelled")
        elif timed_out.is_set():
            raise TimeoutError("Audio processing timed out")
        elif return_code != 0 or not target.is_file() or target.stat().st_size == 0:
            error_log.seek(0)
            detail = error_log.read(4096).lower()
            if "unknown encoder" in detail or "encoder not found" in detail:
                raise RuntimeError("Requested audio encoder is unavailable")
            raise RuntimeError("Audio processing failed; check input codec and output format")
        else:
            url = f"/api/download/{output_id}/{request.output_format}"
            with _lock:
                job.update(status="completed", progress=100, message="Completed", download_url=url, preview_url=url)
    except (OSError, RuntimeError, TimeoutError, subprocess.TimeoutExpired) as exc:
        with _lock:
            if job["cancel"].is_set():
                job.update(status="cancelled", message="Cancelled")
            else:
                job.update(status="failed", message="Audio processing timed out" if "timed_out" in locals() and timed_out.is_set() else str(exc) if isinstance(exc, RuntimeError) else "Audio processing failed")
    finally:
        if "finished" in locals():
            finished.set()
        if "timer" in locals():
            timer.cancel()
        if process is not None and process.poll() is None:
            stop_process(process)
            process.wait()
        if process is not None and process.stdout is not None:
            process.stdout.close()
        error_log.close()
        with _lock:
            _futures.pop(job_id, None)
            job["process"] = None
            complete = job["status"] == "completed"
        if not complete:
            target.unlink(missing_ok=True)


def stop_process(process):
    if process.poll() is not None:
        return
    try:
        if os.name == "posix":
            os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
    except ProcessLookupError:
        pass


def cancel_job(job_id):
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Job not found")
        if job["status"] not in TERMINAL:
            job["cancel"].set()
            if job["status"] == "queued":
                job.update(status="cancelled", message="Cancelled")
                future = _futures.get(job_id)
                if future is not None:
                    future.cancel()
            process = job["process"]
            if process is not None and process.poll() is None:
                stop_process(process)
        return snapshot(job)


def cleanup_expired():
    now = time.time()
    active_paths = set()
    with _lock:
        for job_id, job in list(_jobs.items()):
            future = _futures.get(job_id)
            if job["status"] in TERMINAL and (future is None or future.done()) and now - job["created_at"] > settings.file_retention_hours * 3600:
                del _jobs[job_id]
                _futures.pop(job_id, None)
        for job in _jobs.values():
            if job["status"] not in TERMINAL:
                active_paths.update(job["sources"])
                if job["target"] is not None:
                    active_paths.add(job["target"])
    for folder in (settings.data_dir / "uploads", settings.data_dir / "outputs"):
        if not folder.is_dir():
            continue
        for path in folder.iterdir():
            if path.is_file() and path not in active_paths:
                try:
                    if now - path.stat().st_mtime > settings.file_retention_hours * 3600:
                        path.unlink(missing_ok=True)
                except OSError:
                    pass
