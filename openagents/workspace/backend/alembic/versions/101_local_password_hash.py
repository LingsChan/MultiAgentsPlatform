"""Add optional credentials for self-hosted accounts."""

import sqlalchemy as sa
from alembic import op

deployment_backward_compatible = True
revision = "101"
down_revision = "100"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("local_password_hash", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("users", "local_password_hash")
