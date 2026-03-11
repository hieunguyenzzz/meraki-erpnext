"""Add custom fields for job application levels and applicant profile."""

FIELDS = [
    {
        "dt": "Job Opening",
        "fieldname": "custom_application_level",
        "label": "Application Level",
        "fieldtype": "Select",
        "options": "Intern\nStandard\nSenior",
        "default": "Standard",
        "insert_after": "designation",
    },
    {
        "dt": "Job Applicant",
        "fieldname": "custom_education_degree",
        "label": "Education Degree",
        "fieldtype": "Data",
        "insert_after": "resume_attachment",
    },
    {
        "dt": "Job Applicant",
        "fieldname": "custom_education_institution",
        "label": "Institution",
        "fieldtype": "Data",
        "insert_after": "custom_education_degree",
    },
    {
        "dt": "Job Applicant",
        "fieldname": "custom_education_graduation_year",
        "label": "Graduation Year",
        "fieldtype": "Int",
        "insert_after": "custom_education_institution",
    },
    {
        "dt": "Job Applicant",
        "fieldname": "custom_work_experience",
        "label": "Work Experience",
        "fieldtype": "Text",
        "insert_after": "custom_education_graduation_year",
    },
    {
        "dt": "Job Applicant",
        "fieldname": "custom_linkedin_url",
        "label": "LinkedIn URL",
        "fieldtype": "Data",
        "insert_after": "custom_work_experience",
    },
]


def run(client):
    """Add custom fields for job application levels and applicant profile."""
    print("v035: Adding job application custom fields...")

    for f in FIELDS:
        existing = client.get_list(
            "Custom Field",
            filters={"dt": f["dt"], "fieldname": f["fieldname"]},
            limit=1,
        )
        if not existing:
            client.create("Custom Field", f)
            print(f"  Created {f['dt']}.{f['fieldname']}")
        else:
            print(f"  Already exists: {f['dt']}.{f['fieldname']} (skip)")

    print("v035 done")
