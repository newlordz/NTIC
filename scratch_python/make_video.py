import cv2
import numpy as np
import os

# Setup paths
assets_dir = r"c:\Users\NEWLORDZ\Desktop\CodeAC\StemPlatform.Frontend\src\assets"
output_path = os.path.join(assets_dir, "stem_slideshow.mp4")

# Pick 10 high-quality photos for a diverse representation
img_indices = [8, 5, 7, 9, 1, 3, 4, 11, 12, 13]
img_paths = [os.path.join(assets_dir, f"stem_image_{idx}.jpeg") for idx in img_indices]

# Target dimensions (Full HD)
width, height = 1920, 1080
fps = 30
display_frames = 60    # 2 seconds display
transition_frames = 30 # 1 second transition

# Load, resize, and crop images to cover the canvas (center crop)
images = []
for p in img_paths:
    if os.path.exists(p):
        img = cv2.imread(p)
        if img is None:
            print(f"Warning: Failed to load {p}")
            continue
        h_orig, w_orig = img.shape[:2]
        scale = max(width / w_orig, height / h_orig)
        nw, nh = int(w_orig * scale), int(h_orig * scale)
        img_resized = cv2.resize(img, (nw, nh))
        
        # Center crop to 1920x1080
        x_off = (nw - width) // 2
        y_off = (nh - height) // 2
        img_cropped = img_resized[y_off:y_off+height, x_off:x_off+width]
        images.append(img_cropped)
    else:
        print(f"Warning: {p} does not exist")

if len(images) < 2:
    print("Error: Need at least 2 valid images to compile video.")
    exit(1)

# Setup video writer
# Use 'avc1' fourcc for web-compatible H.264 support (requires OpenH264 DLL)
fourcc = cv2.VideoWriter_fourcc(*'avc1')
writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

num_images = len(images)

for i in range(num_images):
    img_current = images[i]
    img_next = images[(i + 1) % num_images]
    
    # 1. Write static display frames
    for _ in range(display_frames):
        writer.write(img_current)
        
    # 2. Write transition (cross-fade) frames
    for f in range(transition_frames):
        alpha = f / transition_frames
        blended = cv2.addWeighted(img_current, 1 - alpha, img_next, alpha, 0)
        writer.write(blended)

writer.release()
print(f"Success! Video compiled to {output_path}")

# Script execution complete.

