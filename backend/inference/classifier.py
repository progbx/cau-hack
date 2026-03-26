"""
Classification inference module.

TODO: Replace the stub predict() method with your actual model inference.

Expected input:  PIL.Image (any size, RGB)
Expected output: dict with keys:
    - predicted_class: int (0-11)
    - confidence: float (0-1)
    - probabilities: dict {0: float, 1: float, ..., 11: float} (sum to ~1.0)
"""

import random
from PIL import Image


class Classifier:
    NUM_CLASSES = 12

    def __init__(self, model_path: str | None = None):
        self.model = None
        self.model_loaded = False

        if model_path:
            # TODO: Load your trained classification model here
            # Example (PyTorch):
            #   import torch
            #   self.model = torch.load(model_path, map_location="cpu")
            #   self.model.eval()
            #   self.model_loaded = True
            pass

    def predict(self, image: Image.Image) -> dict:
        """
        Run classification on a biopsy image.

        TODO: Replace the stub below with your actual model inference.
        Steps you'll typically need:
          1. Resize/normalize the image to match training transforms
          2. Convert to tensor
          3. Run model forward pass
          4. Apply softmax to get probabilities
          5. Return the result dict
        """

        # ── STUB: returns random predictions ──
        raw = [random.expovariate(1.0) for _ in range(self.NUM_CLASSES)]
        total = sum(raw)
        probabilities = {i: round(raw[i] / total, 4) for i in range(self.NUM_CLASSES)}

        predicted_class = max(probabilities, key=probabilities.get)
        confidence = probabilities[predicted_class]

        return {
            "predicted_class": predicted_class,
            "confidence": confidence,
            "probabilities": probabilities,
        }
