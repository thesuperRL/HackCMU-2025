from PIL import Image
import os

CROPPED_DIR = "data/lanternflies/cropped_dataset/lanternfly"
CROPPED_REMOVED = "data/lanternflies/cropped_dataset/lanternfly"


for fname in os.listdir(CROPPED_DIR):
    path = os.path.join(CROPPED_DIR, fname)
    img = Image.open(path)


    # Save cropped image
    base, ext = os.path.splitext(fname)
    img.show()  # manually verify
    ok = input("Keep this image? (y/n): ")
    if ok.lower() != "y":
        out_path = os.path.join(CROPPED_REMOVED, f"{base}_obj{fname}{ext}")
        img.save(out_path)
        os.remove(path)
        print(f"Saved {out_path}")