import base64
import requests
import time

with open("testimage.jpeg", "rb") as f:
    encoded = base64.b64encode(f.read()).decode("utf-8")

print("Sending request...")
start = time.time()

response = requests.post(
    "http://localhost:8000/vision/describe",
    json={"image_base64": encoded}
)

elapsed = round(time.time() - start, 2)

if response.status_code == 200:
    print(f"Description: {response.json()['description']}")
    print(f"Latency: {elapsed}s")
else:
    print(f"Error {response.status_code}: {response.json()}")