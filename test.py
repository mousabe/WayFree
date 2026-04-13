import argparse
import base64
import time
from pathlib import Path

import requests


def parse_args():
    parser = argparse.ArgumentParser(
        description="Send a single image to the WayFree vision endpoint."
    )
    parser.add_argument("image", help="Path to a local image file")
    parser.add_argument(
        "--url",
        default="http://localhost:8000/vision/describe",
        help="Vision endpoint URL",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    image_path = Path(args.image)

    if not image_path.exists():
        raise SystemExit(f"Image not found: {image_path}")

    encoded = base64.b64encode(image_path.read_bytes()).decode("utf-8")

    print(f"Sending {image_path.name} to {args.url}...")
    start = time.time()

    response = requests.post(
        args.url,
        json={"image_base64": encoded},
        timeout=30,
    )

    elapsed = round(time.time() - start, 2)

    if response.status_code != 200:
        raise SystemExit(f"Error {response.status_code}: {response.text}")

    payload = response.json()
    print(f"Alert level: {payload.get('alert_level', 'unknown')}")
    print(f"Summary: {payload.get('summary', '')}")
    print(f"Latency: {elapsed}s")

    sections = payload.get("sections", {})
    if sections:
        print("\nSections:")
        for key, value in sections.items():
            print(f"- {key}: {value}")


if __name__ == "__main__":
    main()
