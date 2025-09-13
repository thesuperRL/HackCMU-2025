from ultralytics import YOLO
from PIL import Image
import os

# Paths
RAW_DIR = "data/lanternflies/valid/object"
CROPPED_DIR = "data/lanternflies/valid/object"

# Make output directory if not exists
os.makedirs(CROPPED_DIR, exist_ok=True)

# Load YOLO model (pretrained on COCO; replace with your custom .pt if available)
model = YOLO("yolov8n.pt")

# Loop through all images
for filename in os.listdir(RAW_DIR):
    if not filename.lower().endswith((".jpg", ".jpeg", ".png")):
        continue

    img_path = os.path.join(RAW_DIR, filename)
    results = model(img_path)

    # Open image
    img = Image.open(img_path)

    # For each detected object
    for i, box in enumerate(results[0].boxes.xyxy):
        x1, y1, x2, y2 = map(int, box)
        cropped = img.crop((x1, y1, x2, y2))   # crop bbox
        cropped = cropped.resize((224, 224))   # resize for classifier

        # Save cropped image
        base, ext = os.path.splitext(filename)
        out_path = os.path.join(CROPPED_DIR, f"{base}_obj{i}{ext}")
        cropped.save(out_path)
        os.remove(img_path)

        print(f"Saved {out_path}")

