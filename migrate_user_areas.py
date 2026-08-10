"""Migração idempotente das origens históricas para áreas por usuário.

Execute somente após realizar backup do banco:
    python migrate_user_areas.py
"""
import json

from main import SessionLocal, init_db, migrar_areas_existentes


def main():
    init_db()
    db = SessionLocal()
    try:
        resultado = migrar_areas_existentes(db)
        print(json.dumps(resultado, ensure_ascii=False, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    main()
