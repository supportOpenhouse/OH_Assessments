"""The assessment registry.

Deliberately a Python constant, not a database table. One row of reference data
that only this process reads is a join waiting to happen; a table earns its place
when something *else* needs to read it, or when a non-engineer needs to edit it.

Adding an assessment: add an entry here, widen the `submissions_type_valid`
check constraint, create the child table and its two triggers, and add the
routes. See the recipe at the bottom of migrations/001_schema.sql.
"""

SALES_INSIGHT = "sales_insight"

ASSESSMENTS = {
    SALES_INSIGHT: {
        "key": SALES_INSIGHT,
        "slug": "sales-insight",
        "name": "Sales (Insight)",
        "blurb": "A recorded sales pitch, assessed on what you said and how you said it.",
        "format": "Audio recording",
        "target_length": "2–3 minutes",
        "attempts": 1,
    },
}

# slug → key, so URLs read as /assessments/sales-insight rather than snake_case.
BY_SLUG = {a["slug"]: k for k, a in ASSESSMENTS.items()}


def public(key: str) -> dict:
    """The fields safe to show a candidate. Never any scoring detail."""
    a = ASSESSMENTS[key]
    return {k: a[k] for k in ("key", "slug", "name", "blurb", "format",
                              "target_length", "attempts")}


def name_of(key: str) -> str:
    a = ASSESSMENTS.get(key)
    return a["name"] if a else key
