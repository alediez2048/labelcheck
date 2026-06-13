"""Image generation + vision read-back providers.

Three implementations of a narrow Provider interface:
  - MockProvider:    canned outputs for offline testing
  - OpenAIProvider:  gpt-image-1 (generate) + gpt-4o (read)
  - GeminiProvider:  imagen-3 (generate) + gemini-2.0-flash (read)

The provider is selected at the CLI level. The interface stays narrow on purpose
so swapping providers is a flag, not a rewrite (mirrors the LabelCheck app's
vision-provider adapter pattern, systemsdesign D8).

MODEL IDS: verified against vendor docs at write time. If you hit a 404 / model
not available, check the live docs — image and vision models churn often, and
the IDs below may have superseded variants. Documented in README.md.
"""

from __future__ import annotations

import io
import os
from abc import ABC, abstractmethod
from typing import Optional

from PIL import Image


class Provider(ABC):
    """Narrow adapter interface for image generation + vision transcription."""

    name: str = "abstract"

    @abstractmethod
    def generate_image(self, prompt: str) -> Image.Image:
        """Return a PIL Image generated from the prompt."""
        ...

    @abstractmethod
    def read_label(self, img: Image.Image) -> dict:
        """Transcribe label fields from an image.

        Returns a dict with keys: brand, fanciful, class_type, abv, net_contents,
        origin, warning_text (raw transcription of the warning block, or empty).
        Values are best-effort string transcriptions; missing fields are empty.
        """
        ...

    def cost_per_case(self) -> float:
        """Approximate USD cost of one case (image gen + one vision read-back)."""
        return 0.0


class MockProvider(Provider):
    """Returns canned outputs — for offline testing of the AI code path."""

    name = "mock"

    def generate_image(self, prompt: str) -> Image.Image:
        # Return a plain 1024x1024 white image with a marker so tests can detect.
        img = Image.new("RGB", (1024, 1024), (255, 255, 255))
        return img

    def read_label(self, img: Image.Image) -> dict:
        return {
            "brand": "MOCK BRAND",
            "fanciful": "",
            "class_type": "MOCK TYPE",
            "abv": "40%",
            "net_contents": "750 ML",
            "origin": "Mockland",
            "warning_text": (
                "GOVERNMENT WARNING: (1) According to the Surgeon General, women "
                "should not drink alcoholic beverages during pregnancy because of "
                "the risk of birth defects. (2) Consumption of alcoholic beverages "
                "impairs your ability to drive a car or operate machinery, and may "
                "cause health problems."
            ),
        }


class OpenAIProvider(Provider):
    """OpenAI image generation + vision read-back (gpt-4o).

    Tries image models in order: gpt-image-1 → dall-e-3 → dall-e-2.
    Per-model project-level limits are independent, so older models may work
    when gpt-image-1 is blocked by a zero per-project limit.

    Requires OPENAI_API_KEY. Install: pip install openai
    """

    name = "openai"
    IMAGE_MODELS = ["gpt-image-1", "dall-e-3", "dall-e-2"]
    VISION_MODEL = "gpt-4o"

    def __init__(self) -> None:
        try:
            from openai import OpenAI
        except ImportError as e:
            raise RuntimeError(
                "openai package not installed. Run: pip install openai"
            ) from e
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise RuntimeError("OPENAI_API_KEY not set in environment")
        self._client = OpenAI(api_key=api_key)
        self._active_model: Optional[str] = None  # locked-in after first success

    def generate_image(self, prompt: str) -> Image.Image:
        # If we've already proven a model works this run, just use it.
        candidates = [self._active_model] if self._active_model else self.IMAGE_MODELS

        last_err: Optional[Exception] = None
        for model in candidates:
            try:
                return self._call_image_model(model, prompt)
            except Exception as e:
                last_err = e
                msg = str(e)
                # Only fall through to next model on billing/quota errors.
                if "billing_hard_limit" in msg or "insufficient_quota" in msg or "model_not_found" in msg:
                    print("    %s blocked (%s) — trying next model" %
                          (model, msg[:80].replace("\n", " ")))
                    continue
                # Any other error: stop and surface it.
                raise
        raise last_err if last_err else RuntimeError("no image model succeeded")

    def _call_image_model(self, model: str, prompt: str) -> Image.Image:
        import base64
        # Pass only the universal params; response_format is rejected on some
        # endpoints. gpt-image-1 returns b64; dall-e returns URL by default; we
        # handle both response shapes below.
        resp = self._client.images.generate(
            model=model,
            prompt=prompt,
            n=1,
            size="1024x1024",
        )
        if not self._active_model:
            self._active_model = model
            print("    using OpenAI image model: %s" % model)
        item = resp.data[0]
        b64 = getattr(item, "b64_json", None)
        if b64:
            data = base64.b64decode(b64)
        else:
            url = getattr(item, "url", None)
            if not url:
                raise RuntimeError("OpenAI image response had neither b64_json nor url")
            import urllib.request
            data = urllib.request.urlopen(url).read()
        return Image.open(io.BytesIO(data)).convert("RGB")

    def read_label(self, img: Image.Image) -> dict:
        import base64
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        b64 = base64.b64encode(buf.getvalue()).decode("ascii")

        prompt = (
            "You are reading an alcohol product label. Transcribe ONLY what is "
            "actually printed on the label, exactly as shown. Do not infer or "
            "correct. Return a JSON object with these keys: brand, fanciful, "
            "class_type, abv, net_contents, origin, warning_text. Use empty "
            "string for any field not visible. Preserve exact capitalization of "
            "the warning_text. Output JSON only, no prose."
        )
        resp = self._client.chat.completions.create(
            model=self.VISION_MODEL,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {
                        "url": "data:image/png;base64," + b64,
                    }},
                ],
            }],
            response_format={"type": "json_object"},
        )
        import json
        return json.loads(resp.choices[0].message.content)

    def cost_per_case(self) -> float:
        # Rough: gpt-image-1 standard quality ~$0.04/image; gpt-4o vision ~$0.005/call.
        return 0.045


class GeminiProvider(Provider):
    """Google image generation + vision read-back.

    Tries Imagen 3 first (higher quality, requires paid tier), falls back to
    Gemini's native image generation (gemini-2.5-flash-image-preview, aka
    Nano Banana) which works on the free AI Studio API key tier.

    Requires GEMINI_API_KEY or GOOGLE_API_KEY. Install: pip install google-genai
    """

    name = "gemini"
    # Verified accessible via client.models.list() on this account:
    #   imagen-4.0-generate-001       — production Imagen 4 (paid)
    #   imagen-4.0-fast-generate-001  — faster/cheaper variant
    #   gemini-2.5-flash-image        — native multimodal image gen
    #   gemini-3.1-flash-image        — newer native, may need preview access
    IMAGEN_MODEL = "imagen-4.0-generate-001"
    NATIVE_IMAGE_MODEL = "gemini-2.5-flash-image"
    VISION_MODEL = "gemini-2.5-flash"  # gemini-2.0-flash deprecated

    def __init__(self) -> None:
        try:
            from google import genai  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "google-genai package not installed. Run: pip install google-genai"
            ) from e
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY or GOOGLE_API_KEY not set")
        self._genai = genai
        self._client = genai.Client(api_key=api_key)
        self._active_path: Optional[str] = None  # 'imagen' | 'native'

    def generate_image(self, prompt: str) -> Image.Image:
        # If we've already locked in a path this run, use it directly.
        if self._active_path == "imagen":
            return self._call_imagen(prompt)
        if self._active_path == "native":
            return self._call_native(prompt)

        # First call — try Imagen, then fall back.
        try:
            img = self._call_imagen(prompt)
            self._active_path = "imagen"
            print("    using Gemini image path: Imagen 3")
            return img
        except Exception as e:
            msg = str(e)
            # Print the Imagen error so we can diagnose paid-tier issues.
            short = msg.replace("\n", " ")[:200]
            print("    Imagen 3 error: %s" % short)
            if "NOT_FOUND" in msg or "not found" in msg or "not supported" in msg or \
               "permission" in msg.lower() or "PERMISSION_DENIED" in msg:
                print("    falling back to native image generation (%s)" %
                      self.NATIVE_IMAGE_MODEL)
                img = self._call_native(prompt)
                self._active_path = "native"
                print("    using Gemini image path: native (%s)" %
                      self.NATIVE_IMAGE_MODEL)
                return img
            raise

    def _call_imagen(self, prompt: str) -> Image.Image:
        resp = self._client.models.generate_images(
            model=self.IMAGEN_MODEL,
            prompt=prompt,
            config={"number_of_images": 1, "aspect_ratio": "1:1"},
        )
        png_bytes = resp.generated_images[0].image.image_bytes
        return Image.open(io.BytesIO(png_bytes)).convert("RGB")

    def _call_native(self, prompt: str) -> Image.Image:
        from google.genai import types  # type: ignore
        resp = self._client.models.generate_content(
            model=self.NATIVE_IMAGE_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE", "TEXT"],
            ),
        )
        # The image is one of the parts in the response.
        for part in resp.candidates[0].content.parts:
            inline = getattr(part, "inline_data", None)
            if inline and getattr(inline, "data", None):
                return Image.open(io.BytesIO(inline.data)).convert("RGB")
        raise RuntimeError(
            "Gemini native image response had no inline_data; got text instead"
        )

    def read_label(self, img: Image.Image) -> dict:
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        png_bytes = buf.getvalue()
        prompt = (
            "You are reading an alcohol product label. Transcribe ONLY what is "
            "actually printed on the label, exactly as shown. Do not infer or "
            "correct. Return a JSON object with these keys: brand, fanciful, "
            "class_type, abv, net_contents, origin, warning_text. Use empty "
            "string for any field not visible. Preserve exact capitalization of "
            "the warning_text. Output JSON only, no prose."
        )
        from google.genai import types  # type: ignore
        resp = self._client.models.generate_content(
            model=self.VISION_MODEL,
            contents=[
                prompt,
                types.Part.from_bytes(data=png_bytes, mime_type="image/png"),
            ],
            config={"response_mime_type": "application/json"},
        )
        import json
        return json.loads(resp.text)

    def cost_per_case(self) -> float:
        # Rough: Imagen 3 ~$0.04/image; Gemini 2.0 Flash vision ~$0.001/call.
        return 0.041


def get_provider(name: str) -> Provider:
    """Factory. `name` is one of: deterministic, mock, openai, gemini."""
    if name in ("deterministic", "pillow"):
        # Caller bypasses Provider entirely — return None semantics handled in CLI.
        # But we still expose a sentinel here for cost accounting.
        return _DeterministicSentinel()
    if name == "mock":
        return MockProvider()
    if name == "openai":
        return OpenAIProvider()
    if name == "gemini":
        return GeminiProvider()
    raise ValueError("unknown provider: %r" % name)


class _DeterministicSentinel(Provider):
    """Marker so the CLI can carry a uniform provider object even in Pillow mode."""

    name = "deterministic"

    def generate_image(self, prompt: str) -> Image.Image:
        raise RuntimeError("deterministic provider does not call generate_image")

    def read_label(self, img: Image.Image) -> dict:
        raise RuntimeError("deterministic provider does not call read_label")
