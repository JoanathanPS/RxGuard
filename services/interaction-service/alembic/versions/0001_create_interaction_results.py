"""Create the interaction_svc schema and interaction_results table."""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE SCHEMA IF NOT EXISTS "interaction_svc"')
    op.create_table(
        "interaction_results",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("prescription_id", sa.Integer(), nullable=True),
        sa.Column("drug_a", sa.String(length=255), nullable=False),
        sa.Column("drug_b", sa.String(length=255), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("mechanism", sa.String(length=500), nullable=False),
        sa.Column("action", sa.String(length=500), nullable=True),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("engine", sa.String(length=16), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("detection_time_ms", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_interaction_results_prescription_id", "interaction_results", ["prescription_id"]
    )


def downgrade() -> None:
    op.drop_table("interaction_results")
    op.execute('DROP SCHEMA IF EXISTS "interaction_svc" CASCADE')
