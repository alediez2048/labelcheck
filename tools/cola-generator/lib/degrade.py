"""Image degradation for the blurry/review lane.

Takes a clean label image and applies blur + downscale + re-upscale to simulate
a hurried phone photo. Used for the `blurry_image` defect.
"""

from PIL import Image, ImageFilter


def blur_and_downscale(img: Image.Image, blur_radius: float = 2.2,
                       downscale_factor: int = 3) -> Image.Image:
    """Simulate a low-quality phone photo.

    Steps:
      1. Downscale to 1/N of original size (loses detail).
      2. Upscale back to original (interpolation introduces blur).
      3. Gaussian blur on top (simulates motion or focus blur).

    The result should be unreadable enough to land in the review lane but not so
    bad that it's clearly unusable — the system should request a better image.
    """
    w, h = img.size
    small = img.resize((w // downscale_factor, h // downscale_factor))
    back = small.resize((w, h))
    return back.filter(ImageFilter.GaussianBlur(blur_radius))
