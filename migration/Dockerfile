FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy migration scripts
COPY . .

# Run full migration then seed phases
CMD ["sh", "-c", "python run.py --all && python migrate_auto.py"]
