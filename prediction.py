from tensorflow.keras.models import load_model
import numpy as np
from tensorflow.keras.preprocessing import image
from ultralytics import YOLO
import cv2
import os
import matplotlib.pyplot as plt

# --- Load YOLO model (pretrained or your custom model) ---
# Replace 'yolov5s.pt' with your trained weights if you have them
model1 = YOLO("yolov5s.pt")  

# --- Function to crop detected objects ---
def crop_objects(image_path, conf_thresh=0.5):
    """
    Returns cropped objects as a list of NumPy arrays (in memory)
    """
    img = cv2.imread(image_path)
    results = model1(image_path)[0]  # get predictions

    cropped_images = []
    for i, box in enumerate(results.boxes.xyxy):
        conf = results.boxes.conf[i].item()
        if conf < conf_thresh:
            continue  # skip low-confidence boxes
        x1, y1, x2, y2 = map(int, box)
        crop = img[y1:y2, x1:x2]
        plt.imshow(crop)
        plt.title(f"Prediction:")
        plt.axis("off")
        plt.show()
        cropped_images.append(crop)  # keep in memory

    print(f"Cropped {len(cropped_images)} object(s) (not saved to disk)")
    return cropped_images

# Load the model
model = load_model("my_model.h5")

# Now you can use it directly for predictions

# Example: single image
crops = crop_objects("/Users/jesseli/Downloads/istockphoto-481248302-612x612.jpg", conf_thresh=0.25)

# 2. Iterate over each crop and predict

if(len(crops)==0):
    result="NO"
    print(f"Crop: Class {result}")
else:
    resized = cv2.resize(crops[0], (224, 224))
    img_array = np.expand_dims(resized / 255.0, axis=0)  # normalize & add batch dim
# Make prediction
    pred = model.predict(img_array)
    predicted_class = np.argmax(pred, axis=1)[0]
    confidence = pred[0][predicted_class]
    if(predicted_class==0 and confidence>0.9):
        result="YES"
    else:
        result="NO"
    print(f"Crop: Class {result} with confidence {confidence:.2f}")
