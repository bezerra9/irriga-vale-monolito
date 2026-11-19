"""clima, economia e intervalo de leitura

Revision ID: 5c1e9a7b3d21
Revises: 22b87e6d0db4
Create Date: 2026-11-15 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5c1e9a7b3d21"
down_revision: str | None = "22b87e6d0db4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "farms",
        sa.Column("water_price_brl_per_m3", sa.Float(), server_default="5", nullable=False),
    )
    op.add_column(
        "farms",
        sa.Column("reading_interval_min", sa.Integer(), server_default="10", nullable=False),
    )
    op.add_column("farms", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("farms", sa.Column("longitude", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("farms", "longitude")
    op.drop_column("farms", "latitude")
    op.drop_column("farms", "reading_interval_min")
    op.drop_column("farms", "water_price_brl_per_m3")
