"""Utility functions for image encoding and overlay generation."""

import base64
import io

import numpy as np
from PIL import Image


def image_to_base64(image: Image.Image, fmt: str = "PNG") -> str:
    """Convert a PIL Image to a base64-encoded string."""
    buf = io.BytesIO()
    image.save(buf, format=fmt)
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def create_overlay(
    original: Image.Image,
    mask: Image.Image,
    color: tuple[int, int, int] = (253, 107, 38),  # #FD6B26 orange
    alpha: int = 100,
) -> Image.Image:
    """
    Composite a colored semi-transparent mask overlay onto the original image.

    Args:
        original: The original biopsy image (RGB).
        mask: Binary mask (mode='L', values 0 or 255).
        color: RGB tuple for the overlay color.
        alpha: Opacity of the overlay (0-255).

    Returns:
        RGBA image with the overlay applied.
    """
    original_rgba = original.convert("RGBA")
    mask_np = np.array(mask)

    overlay = Image.new("RGBA", original.size, (0, 0, 0, 0))
    overlay_np = np.array(overlay)

    overlay_np[mask_np > 127] = (*color, alpha)

    overlay = Image.fromarray(overlay_np, mode="RGBA")
    result = Image.alpha_composite(original_rgba, overlay)

    return result


def compute_region_percentage(mask: Image.Image) -> float:
    """Calculate the percentage of the image covered by the mask."""
    mask_np = np.array(mask)
    total_pixels = mask_np.size
    masked_pixels = np.count_nonzero(mask_np > 127)
    return round((masked_pixels / total_pixels) * 100, 2) if total_pixels > 0 else 0.0


def compute_density_index(mask: Image.Image) -> float:
    """Compute density index: ratio of mask pixels to bounding box area."""
    mask_np = (np.array(mask) > 127).astype(np.uint8)
    coords = np.argwhere(mask_np)
    if len(coords) == 0:
        return 0.0
    y0, x0 = coords.min(axis=0)
    y1, x1 = coords.max(axis=0)
    bbox_area = max((y1 - y0 + 1) * (x1 - x0 + 1), 1)
    return round(float(coords.shape[0]) / bbox_area, 4)


def compute_boundary_complexity(mask: Image.Image) -> float:
    """Compute boundary complexity: perimeter / sqrt(area). Higher = more irregular."""
    mask_np = (np.array(mask) > 127).astype(np.uint8)
    area = float(np.count_nonzero(mask_np))
    if area == 0:
        return 0.0
    # Simple perimeter: count edge pixels (pixels with at least one non-mask neighbor)
    padded = np.pad(mask_np, 1, mode="constant", constant_values=0)
    eroded = (
        padded[1:-1, 1:-1]
        & padded[:-2, 1:-1]
        & padded[2:, 1:-1]
        & padded[1:-1, :-2]
        & padded[1:-1, 2:]
    )
    perimeter = float(np.count_nonzero(mask_np - eroded))
    return round(perimeter / (area**0.5), 2)


def count_regions(mask: Image.Image) -> int:
    """Count the number of separate connected regions in the mask using simple flood fill."""
    mask_np = (np.array(mask) > 127).astype(np.int32)
    if np.count_nonzero(mask_np) == 0:
        return 0

    from scipy import ndimage
    try:
        labeled, num_features = ndimage.label(mask_np)
        return int(num_features)
    except ImportError:
        # Fallback: rough count without scipy
        return 1


def compute_morphology(mask: Image.Image) -> dict:
    """Compute all morphology metrics for a mask."""
    return {
        "region_percentage": compute_region_percentage(mask),
        "density_index": compute_density_index(mask),
        "boundary_complexity": compute_boundary_complexity(mask),
        "region_count": count_regions(mask),
    }


def create_heatmap(mask: Image.Image) -> Image.Image:
    """Create a colored heatmap from a binary mask (blue→cyan→yellow→red gradient)."""
    mask_np = np.array(mask).astype(np.float32)
    if mask_np.max() > 0:
        mask_np = mask_np / mask_np.max()

    h, w = mask_np.shape
    heatmap = np.zeros((h, w, 3), dtype=np.uint8)

    # Blue (0,0,180) → Cyan (0,200,255) → Yellow (255,255,0) → Red (255,0,0)
    # Region where mask > 0 gets the gradient; background stays dark blue
    for y in range(h):
        for x in range(w):
            v = mask_np[y, x]
            if v < 0.01:
                heatmap[y, x] = [10, 10, 30]  # near-black background
            elif v < 0.33:
                t = v / 0.33
                heatmap[y, x] = [int(0 + t * 0), int(0 + t * 200), int(180 + t * 75)]
            elif v < 0.66:
                t = (v - 0.33) / 0.33
                heatmap[y, x] = [int(t * 255), int(200 + t * 55), int(255 - t * 255)]
            else:
                t = (v - 0.66) / 0.34
                heatmap[y, x] = [255, int(255 - t * 255), 0]

    return Image.fromarray(heatmap, mode="RGB")


# Vectorized version for performance
def create_heatmap(mask: Image.Image) -> Image.Image:
    """Create a colored heatmap from a binary/grayscale mask using vectorized numpy."""
    mask_np = np.array(mask).astype(np.float32)
    if mask_np.max() > 0:
        mask_np = mask_np / mask_np.max()

    h, w = mask_np.shape
    r = np.zeros((h, w), dtype=np.uint8)
    g = np.zeros((h, w), dtype=np.uint8)
    b = np.zeros((h, w), dtype=np.uint8)

    # Background (v < 0.01)
    bg = mask_np < 0.01
    r[bg], g[bg], b[bg] = 10, 10, 30

    # Blue→Cyan (0.01 ≤ v < 0.33)
    m1 = (mask_np >= 0.01) & (mask_np < 0.33)
    t1 = (mask_np[m1] - 0.01) / 0.32
    r[m1] = 0
    g[m1] = (t1 * 200).astype(np.uint8)
    b[m1] = (180 + t1 * 75).astype(np.uint8)

    # Cyan→Yellow (0.33 ≤ v < 0.66)
    m2 = (mask_np >= 0.33) & (mask_np < 0.66)
    t2 = (mask_np[m2] - 0.33) / 0.33
    r[m2] = (t2 * 255).astype(np.uint8)
    g[m2] = (200 + t2 * 55).astype(np.uint8)
    b[m2] = (255 - t2 * 255).astype(np.uint8)

    # Yellow→Red (0.66 ≤ v ≤ 1.0)
    m3 = mask_np >= 0.66
    t3 = (mask_np[m3] - 0.66) / 0.34
    r[m3] = 255
    g[m3] = (255 - t3 * 255).astype(np.uint8)
    b[m3] = 0

    heatmap = np.stack([r, g, b], axis=-1)
    return Image.fromarray(heatmap, mode="RGB")


def generate_preprocessing_steps(image: Image.Image) -> dict:
    """Generate preprocessing visualization steps for display."""
    # Step 1: Resized (224x224 — typical model input)
    resized = image.resize((224, 224), Image.LANCZOS)

    # Step 2: Normalized (visualize pixel distribution shift)
    img_np = np.array(resized).astype(np.float32) / 255.0
    # Enhance contrast to show normalization effect
    mean = img_np.mean(axis=(0, 1))
    std = img_np.std(axis=(0, 1)) + 1e-7
    normalized = (img_np - mean) / std
    # Rescale to 0-255 for display
    normalized = ((normalized - normalized.min()) / (normalized.max() - normalized.min() + 1e-7) * 255).astype(np.uint8)
    normalized_img = Image.fromarray(normalized)

    # Step 3: Grayscale (single-channel representation)
    grayscale = resized.convert("L").convert("RGB")

    return {
        "resized": resized,
        "normalized": normalized_img,
        "grayscale": grayscale,
    }
