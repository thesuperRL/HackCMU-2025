import tensorflow as tf
import matplotlib.pyplot as plt
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout
from tensorflow.keras.models import Model
from tensorflow.keras.preprocessing import image
import numpy as np
import matplotlib.pyplot as plt
from tensorflow.keras import layers




# ------------------------------------------------------
# 1. Load Dataset (Cats vs Dogs from TFDS)
# ------------------------------------------------------
IMG_SIZE = (224, 224)
BATCH_SIZE = 32


train_ds = tf.keras.utils.image_dataset_from_directory(
    '/Users/jesseli/Downloads/lanternflies/train',
    label_mode="binary",
    image_size=(224,224),
    batch_size=32
)

val_ds = tf.keras.utils.image_dataset_from_directory(
    '/Users/jesseli/Downloads/lanternflies/valid',
    label_mode="binary",
    image_size=(224,224),
    batch_size=32
)

test_ds = tf.keras.utils.image_dataset_from_directory(
    '/Users/jesseli/Downloads/lanternflies/test',
    label_mode="binary",
    image_size=(224,224),
    batch_size=32
)

# ------------------------------------------------------
# 2. Normalize Pixel Values
# ------------------------------------------------------
normalization_layer = tf.keras.layers.Rescaling(1./255)
train_ds = train_ds.map(lambda x, y: (normalization_layer(x), y))
val_ds = val_ds.map(lambda x, y: (normalization_layer(x), y))
test_ds = test_ds.map(lambda x, y: (normalization_layer(x), y))

data_augmentation = tf.keras.Sequential([
    layers.RandomFlip("horizontal"),
    layers.RandomRotation(0.1),
    layers.RandomZoom(0.1),
])
train_ds = train_ds.map(lambda x, y: (data_augmentation(x, training=True), y))

# ------------------------------------------------------
# 3. Build Model (Transfer Learning with MobileNetV2)
# ------------------------------------------------------
base_model = MobileNetV2(weights="imagenet", include_top=False, input_shape=(224,224,3))
base_model.trainable = False  # freeze base model

x = GlobalAveragePooling2D()(base_model.output)
x = Dropout(0.3)(x)
output = Dense(1, activation="sigmoid")(x)

model = Model(inputs=base_model.input, outputs=output)

model.compile(optimizer="adam",
              loss="binary_crossentropy",
              metrics=["accuracy"])

# ------------------------------------------------------
# 4. Train
# ------------------------------------------------------
history = model.fit(train_ds, validation_data=val_ds, epochs=20)

# ------------------------------------------------------
# 5. Plot Accuracy and Loss
# ------------------------------------------------------
def plot_history(history):
    acc = history.history['accuracy']
    val_acc = history.history['val_accuracy']
    loss = history.history['loss']
    val_loss = history.history['val_loss']
    epochs = range(1, len(acc) + 1)

    plt.figure(figsize=(12, 5))
    plt.subplot(1, 2, 1)
    plt.plot(epochs, acc, 'b-', label='Training Accuracy')
    plt.plot(epochs, val_acc, 'r-', label='Validation Accuracy')
    plt.title('Training vs Validation Accuracy')
    plt.xlabel('Epochs')
    plt.ylabel('Accuracy')
    plt.legend()

    plt.subplot(1, 2, 2)
    plt.plot(epochs, loss, 'b-', label='Training Loss')
    plt.plot(epochs, val_loss, 'r-', label='Validation Loss')
    plt.title('Training vs Validation Loss')
    plt.xlabel('Epochs')
    plt.ylabel('Loss')
    plt.legend()
    plt.show()

plot_history(history)

# ------------------------------------------------------
# 6. Evaluate on Test Set
# ------------------------------------------------------
test_loss, test_acc = model.evaluate(test_ds)
print(f"Test Accuracy: {test_acc:.2f}")



# Path to your image
img_path = "/Users/jesseli/Downloads/lanternflies/valid/object/2DD59ABE-9EC1-4265-AA16-5C6E2F324371-scaled-e1598437095921_jpeg_jpg.rf.ec9d98b39787df70e926e31e0be91532.jpg"

# Load the image with target size matching your model input
img = image.load_img(img_path, target_size=(224, 224))

img_array = image.img_to_array(img)       # shape (224,224,3)
img_array = img_array / 255.0             # normalize to [0,1]
img_array = np.expand_dims(img_array, axis=0)  # shape (1,224,224,3) for batch

pred_prob = model.predict(img_array)[0][0]  # probability of class "Object"
pred_label = "Object" if pred_prob > 0.5 else "No Object"

print(f"Prediction: {pred_label} ({pred_prob:.2f})")

plt.imshow(img)
plt.title(f"Prediction: {pred_label} ({pred_prob:.2f})")
plt.axis("off")
plt.show()