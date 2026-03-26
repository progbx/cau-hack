"""
Segmentation inference module.

TODO: Replace the stub predict() method with your actual model inference.

Expected input:  PIL.Image (any size, RGB)
Expected output: PIL.Image (same size as input, mode='L', pixel values 0 or 255)
"""

import numpy as np
from PIL import Image


class Segmentor:
    def __init__(self, model_path: str | None = None):
        self.model = None
        self.model_loaded = False

        if model_path:
            # TODO: Load your trained segmentation model here
            # Example (PyTorch):
            #   import torch
            #   self.model = torch.load(model_path, map_location="cpu")
            #   self.model.eval()
            #   self.model_loaded = True
            pass

    def predict(self, image: Image.Image) -> Image.Image:
        """
        Run binary segmentation on a biopsy image.

        TODO: Replace the stub below with your actual model inference.
        Steps you'll typically need:
          1. Resize/normalize the image to match training transforms
          2. Convert to tensor
          3. Run model forward pass
          4. Threshold output to get binary mask
          5. Resize mask back to original image size
          6. Return as PIL Image mode='L' with values 0 and 255

        The returned mask MUST be the same size as the input image.
        """

        # ── STUB: generates an elliptical region in the center ──
        w, h = image.size
        mask = np.zeros((h, w), dtype=np.uint8)

        cy, cx = h // 2, w // 2
        ry, rx = h // 3, w // 4

        Y, X = np.ogrid[:h, :w]
        ellipse = ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2
        mask[ellipse <= 1.0] = 255

        return Image.fromarray(mask, mode="L")
