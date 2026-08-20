"""Create the prescription_svc schema and prescription tables."""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "prescription_svc"')
    op.create_table(
        "prescriptions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), nullable=False),
        sa.Column("clinician_id", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_prescriptions_patient_id", "prescriptions", ["patient_id"])
    op.create_table(
        "prescription_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("prescription_id", sa.Integer(), sa.ForeignKey("prescriptions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("drug_name", sa.String(length=255), nullable=False),
        sa.Column("rxcui", sa.String(length=16), nullable=True),
        sa.Column("dosage", sa.String(length=64), nullable=True),
        sa.Column("route", sa.String(length=32), nullable=True),
    )
    op.create_index("ix_prescription_items_prescription_id", "prescription_items", ["prescription_id"])


def downgrade() -> None:
    op.drop_table("prescription_items")
    op.drop_table("prescriptions")
    op.execute('DROP SCHEMA IF EXISTS "prescription_svc" CASCADE')
