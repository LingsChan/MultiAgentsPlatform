"""Provision a self-hosted account without putting its password in shell history."""

import argparse
import getpass
import sys

from sqlalchemy.exc import IntegrityError

from app.config import config
from app.database import SessionLocal
from app.services.local_accounts import provision_local_account


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("email")
    parser.add_argument("--name", help="Display name")
    args = parser.parse_args()
    if not config.WORKSPACE_LOCAL_AUTH_ENABLED:
        parser.error("Set WORKSPACE_LOCAL_AUTH_ENABLED=1 to provision local accounts.")
    if not sys.stdin.isatty():
        parser.error("Run this command in an interactive terminal for the password prompt.")

    password = getpass.getpass("Password: ")
    if password != getpass.getpass("Confirm password: "):
        parser.error("Passwords do not match.")

    try:
        with SessionLocal.begin() as db:
            provision_local_account(db, args.email, password, args.name)
    except ValueError as error:
        parser.error(str(error))
    except IntegrityError:
        parser.error("The account could not be saved. Check whether it was already provisioned.")
    print(f"Local account ready for {args.email.strip().lower()}.")


if __name__ == "__main__":
    main()
