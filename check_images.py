import csv, os

csv_path = "/Users/venkata/Glauc/GlaucDataFiles/EyeDiseases/RoboFlowFiles/list.csv"
img_dir  = "/Users/venkata/Glauc/Entrepreneurship/DeployCode/Images/Diseases"

# Collect all filenames in Diseases folder (any depth)
existing = set()
for root, dirs, files in os.walk(img_dir):
    for f in files:
        existing.add(f)

# Read list.csv and check each entry
found, missing = [], []
with open(csv_path, newline="") as f:
    reader = csv.reader(f)
    for row in reader:
        if not row:
            continue
        name = os.path.basename(row[0].strip())
        (found if name in existing else missing).append(name)

print(f"Total in CSV : {len(found) + len(missing)}")
print(f"Found in dir : {len(found)}")
print(f"Missing      : {len(missing)}")
if missing[:10]:
    print(f"First 10 missing: {missing[:10]}")
