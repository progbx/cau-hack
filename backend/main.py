"""
CAU AI Vision — FastAPI Backend

Run with:
    cd backend
    uvicorn main:app --reload --port 8000
"""

import io
import time
import zipfile
from io import BytesIO
from pathlib import Path

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image

from inference.classifier import Classifier
from inference.segmentor import Segmentor
from utils import (
    compute_morphology,
    create_heatmap,
    create_overlay,
    generate_preprocessing_steps,
    image_to_base64,
)

# ── App setup ─────────────────────────────────────────────
app = FastAPI(title="CAU AI Vision API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Load models at startup ────────────────────────────────
# TODO: Pass your saved model paths here when ready
classifier = Classifier(model_path=None)
segmentor = Segmentor(model_path=None)

# ── In-memory history (last 50 analyses) ──────────────────
history: list[dict] = []
MAX_HISTORY = 50


def _read_image(file_bytes: bytes) -> Image.Image:
    return Image.open(BytesIO(file_bytes)).convert("RGB")


# ── Endpoints ─────────────────────────────────────────────

@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "models_loaded": {
            "classification": classifier.model_loaded,
            "segmentation": segmentor.model_loaded,
        },
    }


@app.post("/api/classify")
async def classify(file: UploadFile = File(...)):
    file_bytes = await file.read()
    image = _read_image(file_bytes)

    start = time.perf_counter()
    result = classifier.predict(image)
    elapsed = round((time.perf_counter() - start) * 1000, 1)

    return {
        **result,
        "inference_time_ms": elapsed,
    }


@app.post("/api/segment")
async def segment(file: UploadFile = File(...)):
    file_bytes = await file.read()
    image = _read_image(file_bytes)

    start = time.perf_counter()
    mask = segmentor.predict(image)
    elapsed = round((time.perf_counter() - start) * 1000, 1)

    overlay = create_overlay(image, mask)
    heatmap = create_heatmap(mask)
    morph = compute_morphology(mask)

    return {
        "mask_base64": image_to_base64(mask),
        "overlay_base64": image_to_base64(overlay),
        "heatmap_base64": image_to_base64(heatmap),
        **morph,
        "inference_time_ms": elapsed,
    }


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """Combined classification + segmentation in one call."""
    file_bytes = await file.read()
    image = _read_image(file_bytes)

    # Classification
    t0 = time.perf_counter()
    cls_result = classifier.predict(image)
    cls_time = round((time.perf_counter() - t0) * 1000, 1)

    # Segmentation
    t1 = time.perf_counter()
    mask = segmentor.predict(image)
    seg_time = round((time.perf_counter() - t1) * 1000, 1)

    overlay = create_overlay(image, mask)
    heatmap = create_heatmap(mask)
    morph = compute_morphology(mask)

    original_b64 = image_to_base64(image)

    entry = {
        "classification": {**cls_result, "inference_time_ms": cls_time},
        "segmentation": {
            "mask_base64": image_to_base64(mask),
            "overlay_base64": image_to_base64(overlay),
            "heatmap_base64": image_to_base64(heatmap),
            **morph,
            "inference_time_ms": seg_time,
        },
        "original_base64": original_b64,
        "filename": file.filename,
    }

    history.insert(0, entry)
    if len(history) > MAX_HISTORY:
        history.pop()

    return entry


@app.get("/api/history")
def get_history(limit: int = 20, offset: int = 0):
    """Return recent analyses (without full image data to keep response small)."""
    slim = []
    for h in history[offset : offset + limit]:
        slim.append({
            "filename": h.get("filename"),
            "predicted_class": h["classification"]["predicted_class"],
            "confidence": h["classification"]["confidence"],
            "region_percentage": h["segmentation"]["region_percentage"],
            "classification_time_ms": h["classification"]["inference_time_ms"],
            "segmentation_time_ms": h["segmentation"]["inference_time_ms"],
        })
    return {"total": len(history), "results": slim}


@app.post("/api/preprocess-preview")
async def preprocess_preview(file: UploadFile = File(...)):
    """Return preprocessing step visualizations."""
    file_bytes = await file.read()
    image = _read_image(file_bytes)
    steps = generate_preprocessing_steps(image)
    return {
        "original_size": f"{image.size[0]}x{image.size[1]}",
        "resized_base64": image_to_base64(steps["resized"]),
        "normalized_base64": image_to_base64(steps["normalized"]),
        "grayscale_base64": image_to_base64(steps["grayscale"]),
    }


# ── Batch Endpoints ───────────────────────────────────────

@app.post("/api/batch-classify")
async def batch_classify(files: list[UploadFile] = File(...)):
    """Classify multiple images, return Excel file."""
    try:
        from openpyxl import Workbook
    except ImportError:
        return {"error": "openpyxl not installed. Run: pip install openpyxl"}

    wb = Workbook()
    ws = wb.active
    ws.title = "Predictions"
    ws.append(["Image_ID", "Label"])

    for f in files:
        file_bytes = await f.read()
        image = _read_image(file_bytes)
        result = classifier.predict(image)
        image_id = Path(f.filename).stem
        ws.append([image_id, result["predicted_class"]])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=test_ground_truth.xlsx"},
    )


@app.post("/api/batch-segment")
async def batch_segment(files: list[UploadFile] = File(...)):
    """Segment multiple images, return ZIP of binary masks."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            file_bytes = await f.read()
            image = _read_image(file_bytes)
            mask = segmentor.predict(image)
            # Save mask as PNG bytes
            mask_buf = io.BytesIO()
            mask.save(mask_buf, format="PNG")
            mask_buf.seek(0)
            zf.writestr(f.filename, mask_buf.getvalue())

    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=masks.zip"},
    )


# ── Serve frontend ────────────────────────────────────────
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.get("/")
def serve_frontend():
    html_file = FRONTEND_DIR / "index.html"
    return HTMLResponse(html_file.read_text(encoding="utf-8"))


app.mount("/css", StaticFiles(directory=str(FRONTEND_DIR / "css")), name="css")
app.mount("/js", StaticFiles(directory=str(FRONTEND_DIR / "js")), name="js")
