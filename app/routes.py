
import json
import math
import shutil
import subprocess
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
import asyncio
from pydantic import BaseModel, Field, model_validator

from app.config import settings

router = APIRouter()
ALLOWED = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".opus", ".webm"}


class TrimRequest(BaseModel):
    file_id: str
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)
    output_format: str = Field(default="mp3", pattern="^(mp3|wav|flac|ogg|opus|m4a)$")


class EffectsRequest(BaseModel):
    file_id: str
    output_format: str = Field(default="mp3", pattern="^(mp3|wav|flac|ogg|opus|m4a)$")
    volume_db: float = Field(default=0, ge=-40, le=20, allow_inf_nan=False)
    fade_in: float = Field(default=0, ge=0, le=3600, allow_inf_nan=False)
    fade_out: float = Field(default=0, ge=0, le=3600, allow_inf_nan=False)


class MergeRequest(BaseModel):
    file_ids: list[str] = Field(min_length=2, max_length=10)
    output_format: str = Field(default="mp3", pattern="^(mp3|wav|flac|ogg|opus|m4a)$")

    @model_validator(mode="after")
    def check_unique_files(self):
        if len(set(self.file_ids)) != len(self.file_ids):
            raise ValueError("Duplicate audio files are not allowed")
        return self


class ConvertRequest(BaseModel):
    file_id: str
    output_format: str = Field(pattern="^(mp3|wav|flac|ogg|opus|m4a)$")


def require_tool(name: str):
    executable = shutil.which(name)
    if not executable:
        raise HTTPException(503, f"{name} is not installed")
    return executable


def media_path(file_id: str) -> Path:
    try:
        identifier = str(uuid.UUID(file_id))
    except ValueError as exc:
        raise HTTPException(400, "Invalid file identifier") from exc

    matches = [path for path in (settings.data_dir / "uploads").glob(f"{identifier}.*") if path.is_file() and path.suffix in ALLOWED]
    if len(matches) != 1:
        raise HTTPException(404, "File not found")

    return matches[0]


@router.get("/health")
def health():
    return {
        "status": "ok",
        "ffmpeg": bool(shutil.which("ffmpeg")),
        "ffprobe": bool(shutil.which("ffprobe")),
    }


@router.post("/upload")
def upload(file: UploadFile = File(...)):
    extension = Path(file.filename or "").suffix.lower()

    if extension not in ALLOWED:
        raise HTTPException(415, "Unsupported audio extension")

    target_dir = settings.data_dir / "uploads"
    target_dir.mkdir(parents=True, exist_ok=True)

    file_id = str(uuid.uuid4())
    target = target_dir / f"{file_id}{extension}"
    limit = settings.max_upload_mb * 1024 * 1024
    total = 0

    try:
        with target.open("wb") as output:
            while chunk := file.file.read(1024 * 1024):
                total += len(chunk)

                if total > limit:
                    raise HTTPException(413, "File exceeds upload limit")

                output.write(chunk)

    except Exception:
        target.unlink(missing_ok=True)
        raise

    finally:
        file.file.close()

    try:
        get_duration(target)
    except HTTPException as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(422, "Unsupported or invalid audio file") from exc

    return {
        "file_id": file_id,
        "filename": file.filename,
        "size": total,
    }


@router.get("/probe/{file_id}")
def probe(file_id: str):
    source = media_path(file_id)

    command = [
        require_tool("ffprobe"),
        "-v",
        "error",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        str(source),
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=settings.probe_timeout_seconds,
            check=True,
        )
        return json.loads(result.stdout)

    except (subprocess.SubprocessError, json.JSONDecodeError) as exc:
        raise HTTPException(422, "Audio inspection failed") from exc


@router.post("/convert")
def convert(request: ConvertRequest):
    source = media_path(request.file_id)

    output_dir = settings.data_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)

    output_id = str(uuid.uuid4())
    target = output_dir / f"{output_id}.{request.output_format}"

    command = [
        require_tool("ffmpeg"),
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-vn",
        str(target),
    ]

    try:
        subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=settings.job_timeout_seconds,
            check=True,
        )

    except (subprocess.SubprocessError, OSError) as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(422, "Audio conversion failed") from exc

    return {
        "output_id": output_id,
        "format": request.output_format,
        "download_url": f"/api/download/{output_id}/{request.output_format}",
    }


@router.get("/download/{output_id}/{extension}")
def download(output_id: str, extension: str):
    try:
        identifier = str(uuid.UUID(output_id))

    except ValueError as exc:
        raise HTTPException(400, "Invalid output identifier") from exc

    if extension not in {"mp3", "wav", "flac", "ogg", "opus", "m4a"}:
        raise HTTPException(400, "Invalid output format")

    target = settings.data_dir / "outputs" / f"{identifier}.{extension}"

    if not target.is_file():
        raise HTTPException(404, "Output not found")

    return FileResponse(
        target,
        filename=f"audio-toolkit-{identifier}.{extension}",
    )


class ReuseRequest(BaseModel):
    output_id: str
    extension: str = Field(pattern="^(mp3|wav|flac|ogg|opus|m4a)$")


@router.post("/reuse")
def reuse_output(request: ReuseRequest):
    try:
        identifier = str(uuid.UUID(request.output_id))
    except ValueError as exc:
        raise HTTPException(400, "Invalid output identifier") from exc
    source = settings.data_dir / "outputs" / f"{identifier}.{request.extension}"
    if not source.is_file():
        raise HTTPException(404, "Output not found or expired")
    target_dir = settings.data_dir / "uploads"
    target_dir.mkdir(parents=True, exist_ok=True)
    file_id = str(uuid.uuid4())
    target = target_dir / f"{file_id}.{request.extension}"
    try:
        if source.stat().st_size > settings.max_upload_mb * 1024 * 1024:
            raise HTTPException(413, "Output exceeds editing size limit")
        shutil.copyfile(source, target)
    except Exception:
        target.unlink(missing_ok=True)
        raise
    return {"file_id": file_id, "filename": f"edited-{identifier}.{request.extension}", "preview_url": f"/api/download/{identifier}/{request.extension}"}


@router.post("/trim")
def trim(request: TrimRequest):
    if not math.isfinite(request.start) or not math.isfinite(request.end) or request.end <= request.start:
        raise HTTPException(422, "Invalid trim range")
    source = media_path(request.file_id)

    probe_command = [
        require_tool("ffprobe"), "-v", "error", "-show_entries",
        "format=duration", "-of", "json", str(source),
    ]
    try:
        metadata = subprocess.run(
            probe_command, capture_output=True, text=True, timeout=settings.probe_timeout_seconds, check=True
        )
        duration = float(json.loads(metadata.stdout)["format"]["duration"])
    except (subprocess.SubprocessError, ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(422, "Unable to determine audio duration") from exc

    if not math.isfinite(duration) or request.end > duration + 0.05:
        raise HTTPException(422, "Trim range exceeds audio duration")

    output_dir = settings.data_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_id = str(uuid.uuid4())
    target = output_dir / f"{output_id}.{request.output_format}"
    command = [
        require_tool("ffmpeg"), "-nostdin", "-hide_banner", "-loglevel", "error",
        "-y", "-ss", str(request.start), "-i", str(source),
        "-t", str(request.end - request.start), "-vn", str(target),
    ]
    try:
        subprocess.run(command, capture_output=True, text=True, timeout=settings.job_timeout_seconds, check=True)
    except (subprocess.SubprocessError, OSError) as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(422, "Audio trimming failed") from exc

    return {
        "output_id": output_id,
        "format": request.output_format,
        "start": request.start,
        "end": request.end,
        "download_url": f"/api/download/{output_id}/{request.output_format}",
    }


def get_duration(source: Path) -> float:
    command = [
        require_tool("ffprobe"), "-v", "error", "-select_streams", "a:0",
        "-show_entries", "format=duration:stream=codec_type", "-of", "json", str(source),
    ]
    try:
        result = subprocess.run(command, capture_output=True, text=True, timeout=settings.probe_timeout_seconds, check=True)
        metadata = json.loads(result.stdout)
        if not metadata.get("streams"):
            raise ValueError("No audio stream")
        duration = float(metadata["format"]["duration"])
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError("Invalid duration")
        return duration
    except (subprocess.SubprocessError, ValueError, KeyError, json.JSONDecodeError) as exc:
        raise HTTPException(422, "Unable to determine audio duration") from exc


def create_output(extension: str) -> tuple[str, Path]:
    output_dir = settings.data_dir / "outputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_id = str(uuid.uuid4())
    return output_id, output_dir / f"{output_id}.{extension}"


def execute_audio(command: list[str], target: Path, message: str) -> None:
    try:
        subprocess.run(command, capture_output=True, text=True, timeout=settings.job_timeout_seconds, check=True)
        if not target.is_file() or target.stat().st_size == 0:
            raise OSError("Empty audio output")
    except (subprocess.SubprocessError, OSError) as exc:
        target.unlink(missing_ok=True)
        raise HTTPException(422, message) from exc


def output_result(output_id: str, extension: str) -> dict:
    return {
        "output_id": output_id,
        "format": extension,
        "download_url": f"/api/download/{output_id}/{extension}",
    }


@router.post("/effects")
def effects(request: EffectsRequest):
    source = media_path(request.file_id)
    duration = get_duration(source)
    if request.fade_in + request.fade_out > duration:
        raise HTTPException(422, "Combined fades exceed audio duration")
    filters = [f"volume={request.volume_db:.3f}dB"]
    if request.fade_in > 0:
        filters.append(f"afade=t=in:st=0:d={request.fade_in:.3f}")
    if request.fade_out > 0:
        filters.append(f"afade=t=out:st={max(0, duration - request.fade_out):.3f}:d={request.fade_out:.3f}")
    output_id, target = create_output(request.output_format)
    command = [
        require_tool("ffmpeg"), "-nostdin", "-hide_banner", "-loglevel", "error",
        "-y", "-i", str(source), "-map", "0:a:0", "-vn",
        "-af", ",".join(filters), str(target),
    ]
    execute_audio(command, target, "Audio effects processing failed")
    return output_result(output_id, request.output_format)


@router.post("/merge")
def merge(request: MergeRequest):
    sources = [media_path(file_id) for file_id in request.file_ids]
    for source in sources:
        get_duration(source)
    output_id, target = create_output(request.output_format)
    command = [require_tool("ffmpeg"), "-nostdin", "-hide_banner", "-loglevel", "error", "-y"]
    for source in sources:
        command.extend(["-i", str(source)])
    inputs = "".join(f"[{index}:a:0]" for index in range(len(sources)))
    graph = f"{inputs}concat=n={len(sources)}:v=0:a=1[out]"
    command.extend(["-filter_complex", graph, "-map", "[out]", "-vn", str(target)])
    execute_audio(command, target, "Audio merging failed")
    return output_result(output_id, request.output_format)


@router.post("/jobs", status_code=202)
def create_job(request: "JobRequest"):
    from app.jobs import submit_job
    return submit_job(request)


@router.get("/jobs/{job_id}")
def job_status(job_id: str):
    from app.jobs import get_job
    return get_job(job_id)


@router.post("/jobs/{job_id}/cancel")
def job_cancel(job_id: str):
    from app.jobs import cancel_job
    return cancel_job(job_id)


@router.get("/jobs/{job_id}/events")
async def job_events(job_id: str):
    from app.jobs import get_job, TERMINAL
    get_job(job_id)

    async def events():
        while True:
            state = get_job(job_id)
            yield f"data: {json.dumps(state)}\n\n"
            if state["status"] in TERMINAL:
                break
            await asyncio.sleep(0.5)

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


from app.jobs import JobRequest
