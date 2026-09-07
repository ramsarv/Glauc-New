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
    for row in csv.reader(f):
        if row:
            name = os.path.basename(row[0].strip())
            (found if name in existing else missing).append(name)

print("Total in CSV:", len(found) + len(missing))
print("Found in dir:", len(found))
print("Missing:     ", len(missing))
if missing[:10]:
    print("First 10 missing:", missing[:10])
