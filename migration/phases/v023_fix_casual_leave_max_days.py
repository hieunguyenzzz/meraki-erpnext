"""Remove the 3-day continuous limit on Casual Leave."""

def run(client):
    client.update("Leave Type", "Casual Leave", {
        "max_continuous_days_allowed": 0
    })
    print("Set Casual Leave max_continuous_days_allowed = 0 (no limit)")
