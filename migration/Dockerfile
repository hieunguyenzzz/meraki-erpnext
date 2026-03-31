FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy migration scripts
COPY . .

# Old full migration (run.py --all) is baked into the DB dump.
# Only run incremental seed phases.
CMD ["python", "migrate_auto.py"]
