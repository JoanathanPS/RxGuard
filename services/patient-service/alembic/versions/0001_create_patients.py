"""Create the patient_svc schema and patient profile tables."""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "patient_svc"')
    op.create_table(
        "patients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("age", sa.Integer(), nullable=True),
        sa.Column("gender", sa.String(length=32), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("height_cm", sa.Float(), nullable=True),
        sa.Column("pregnant", sa.Boolean(), nullable=True),
        sa.Column("breastfeeding", sa.Boolean(), nullable=True),
        sa.Column("created_by", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "patient_conditions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("condition_name", sa.String(length=255), nullable=False),
        sa.Column("diagnosed_date", sa.Date(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_index("ix_patient_conditions_patient_id", "patient_conditions", ["patient_id"])
    op.create_table(
        "patient_allergies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("allergen", sa.String(length=255), nullable=False),
        sa.Column("reaction", sa.String(length=255), nullable=True),
        sa.Column("severity", sa.String(length=32), nullable=True),
    )
    op.create_index("ix_patient_allergies_patient_id", "patient_allergies", ["patient_id"])
    op.create_table(
        "patient_labs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("test_name", sa.String(length=64), nullable=False),
        sa.Column("value", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("recorded_at", sa.Date(), nullable=True),
    )
    op.create_index("ix_patient_labs_patient_id", "patient_labs", ["patient_id"])
    op.create_table(
        "patient_lifestyle",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("patient_id", sa.Integer(), sa.ForeignKey("patients.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("smoking_status", sa.String(length=32), nullable=True),
        sa.Column("alcohol_use", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("patient_lifestyle")
    op.drop_table("patient_labs")
    op.drop_table("patient_allergies")
    op.drop_table("patient_conditions")
    op.drop_table("patients")
    op.execute('DROP SCHEMA IF EXISTS "patient_svc" CASCADE')
